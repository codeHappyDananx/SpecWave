import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OrchestratorAcceptanceInput,
  OrchestratorApprovalInput,
  OrchestratorCreateRequestInput,
  OrchestratorRunResumeInput,
  OrchestratorWebhookPayload
} from '@specwave/contracts';
import type {
  AssistantChatInput,
  AssistantOnboardingContinueInput,
  AssistantOnboardingFinishInput,
  AssistantOnboardingStartInput,
  AssistantSessionApprovalInput,
  UserProfile
} from '../../../packages/contracts/src/orchestrator';
import type { AgentRuntime } from './agentRuntime';
import { AssistantServiceError, type AssistantService } from './assistantService';
import { handleDingtalkAppbotInbound, sendDingtalkSessionWebhook, type DingtalkAppbotRuntimeConfig, verifyDingtalkAppbotSignature } from './dingtalkAppbot';
import type { DesktopAutomation } from './desktopAutomation';
import type { TelegramConnectorConfig } from './connectorConfig';
import { OrchestratorService, OrchestratorServiceError } from './orchestratorService';
import { normalizeChannelWebhook } from './channelAdapters';
import { handleTelegramBotInbound } from './telegramBot';
import { sendTelegramMessage } from './telegramApi';

type StartServerOptions = {
  port: number;
  host: string;
  assistantService?: AssistantService;
  dingtalkAppbot?: DingtalkAppbotRuntimeConfig;
  telegram?: TelegramConnectorConfig;
  agentRuntime?: AgentRuntime;
  desktopAutomation?: DesktopAutomation;
};

type RunningServer = {
  server: Server;
  close: () => Promise<void>;
  address: AddressInfo | null;
};

const JSON_LIMIT_BYTES = 1024 * 1024;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBCHAT_HTML_PATH = path.resolve(__dirname, 'static', 'webchat.html');
let webchatHtmlCache: string | null = null;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, statusCode: number, html: string) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  });
  res.end(html);
}

async function getWebchatHtml(): Promise<string> {
  if (webchatHtmlCache) return webchatHtmlCache;
  webchatHtmlCache = await fs.readFile(WEBCHAT_HTML_PATH, 'utf8');
  return webchatHtmlCache;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += piece.length;
    if (total > JSON_LIMIT_BYTES) {
      throw new OrchestratorServiceError(413, 'PAYLOAD_TOO_LARGE', '请求体过大。');
    }
    chunks.push(piece);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new OrchestratorServiceError(400, 'INVALID_JSON', '请求体不是合法 JSON。');
  }
}

function parseUrlPath(req: IncomingMessage): string {
  const url = req.url ?? '/';
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

function toHeaderText(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function verifyTelegramWebhookSecret(
  headers: IncomingMessage['headers'],
  expectedSecretToken?: string
): boolean {
  if (!expectedSecretToken) return true;
  const actual = toHeaderText(headers['x-telegram-bot-api-secret-token']);
  return actual === expectedSecretToken;
}

function requireAssistantService(options: StartServerOptions): AssistantService {
  if (!options.assistantService) {
    throw new OrchestratorServiceError(503, 'ASSISTANT_DISABLED', '本地助理能力尚未启用。');
  }
  return options.assistantService;
}

function requireAssistantUser(req: IncomingMessage): { userId: string; userName?: string } {
  const userId = toHeaderText(req.headers['x-specwave-user-id']);
  if (!userId) {
    throw new OrchestratorServiceError(400, 'USER_ID_REQUIRED', '缺少 x-specwave-user-id 请求头。');
  }
  return {
    userId,
    userName: toHeaderText(req.headers['x-specwave-user-name'])
  };
}

function toAssistantChatInput(
  body: unknown,
  sessionId: string | undefined,
  user: { userId: string; userName?: string }
): AssistantChatInput {
  const payload = (body ?? {}) as Partial<AssistantChatInput> & { message?: unknown };
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'message 必填。');
  }
  return {
    sessionId: sessionId ?? (typeof payload.sessionId === 'string' ? payload.sessionId : undefined),
    userId: user.userId,
    userName: user.userName,
    channel: typeof payload.channel === 'string' && payload.channel.trim() ? payload.channel.trim() : 'desktop',
    tenantId: typeof payload.tenantId === 'string' && payload.tenantId.trim() ? payload.tenantId.trim() : 'local',
    projectId: typeof payload.projectId === 'string' && payload.projectId.trim() ? payload.projectId.trim() : 'local',
    message
  };
}

export async function startHttpServer(service: OrchestratorService, options: StartServerOptions): Promise<RunningServer> {
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const path = parseUrlPath(req);

      if (method === 'GET' && path === '/healthz') {
        sendJson(res, 200, { ok: true, service: 'specwave-orchestrator' });
        return;
      }

      if (method === 'GET' && path === '/webchat') {
        const html = await getWebchatHtml();
        sendHtml(res, 200, html);
        return;
      }

      if (method === 'GET' && path === '/api/v1/profile/me') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const data = assistantService.getProfile(user.userId);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'PUT' && path === '/api/v1/profile/me') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = (await readJson(req)) as Partial<UserProfile>;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new OrchestratorServiceError(400, 'INVALID_INPUT', '画像更新内容必须是对象。');
        }
        const data = await assistantService.upsertProfile(user.userId, body, user.userName);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'GET' && path === '/api/v1/capability-packs') {
        const assistantService = requireAssistantService(options);
        const data = assistantService.listCapabilityPacks();
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/onboarding/start') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = (await readJson(req)) as Partial<AssistantOnboardingStartInput>;
        const data = await assistantService.startOnboarding({
          userId: user.userId,
          userName: user.userName ?? (typeof body.userName === 'string' ? body.userName : undefined)
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/onboarding/continue') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = (await readJson(req)) as Partial<AssistantOnboardingContinueInput>;
        if (typeof body.message !== 'string' || !body.message.trim()) {
          throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'message 必填。');
        }
        const data = await assistantService.continueOnboarding({ userId: user.userId, message: body.message });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/onboarding/finish') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = (await readJson(req)) as Partial<AssistantOnboardingFinishInput>;
        if (typeof body.confirmed !== 'boolean') {
          throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'confirmed 必填，且必须是布尔值。');
        }
        const data = await assistantService.finishOnboarding({
          userId: user.userId,
          confirmed: body.confirmed,
          note: typeof body.note === 'string' ? body.note : undefined
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/sessions/chat') {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = await readJson(req);
        const data = await assistantService.chat(toAssistantChatInput(body, undefined, user));
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const assistantApproveMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/approve$/);
      if (method === 'POST' && assistantApproveMatch) {
        const assistantService = requireAssistantService(options);
        const user = requireAssistantUser(req);
        const body = (await readJson(req)) as Partial<AssistantSessionApprovalInput>;
        if (body.action !== 'approve' && body.action !== 'reject') {
          throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'action 只能是 approve 或 reject。');
        }
        const data = await assistantService.approveSession(decodeURIComponent(assistantApproveMatch[1]!), {
          action: body.action,
          actorId: typeof body.actorId === 'string' && body.actorId.trim() ? body.actorId : user.userId,
          actorName: typeof body.actorName === 'string' ? body.actorName : user.userName,
          comment: typeof body.comment === 'string' ? body.comment : undefined
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const assistantEvidenceMatch = path.match(/^\/api\/v1\/sessions\/([^/]+)\/evidence$/);
      if (method === 'GET' && assistantEvidenceMatch) {
        const assistantService = requireAssistantService(options);
        const data = assistantService.getSessionEvidence(decodeURIComponent(assistantEvidenceMatch[1]!));
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/requests') {
        const body = (await readJson(req)) as OrchestratorCreateRequestInput;
        const data = await service.createRequest(body);
        sendJson(res, 201, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/channels/dingtalk/appbot/inbound') {
        const appbotConfig = options.dingtalkAppbot;
        if (!appbotConfig) {
          throw new OrchestratorServiceError(503, 'DINGTALK_APPBOT_DISABLED', '未启用钉钉应用机器人入站能力。');
        }
        if (!verifyDingtalkAppbotSignature(req.headers, appbotConfig.signSecret)) {
          throw new OrchestratorServiceError(401, 'DINGTALK_SIGN_INVALID', '钉钉签名校验失败。');
        }
        const body = await readJson(req);
        const data = await handleDingtalkAppbotInbound(service, body, {
          ...appbotConfig,
          agentRuntime: options.agentRuntime,
          desktopAutomation: options.desktopAutomation
        });

        let replyDelivered = false;
        let replyError: string | undefined;
        if (data.sessionWebhook) {
          try {
            await sendDingtalkSessionWebhook(data.sessionWebhook, data.replyText);
            replyDelivered = true;
          } catch (error) {
            replyError = error instanceof Error ? error.message : String(error);
          }
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            ...data,
            replyDelivered,
            replyError
          }
        });
        return;
      }

      if (method === 'POST' && path === '/api/v1/channels/telegram/bot/inbound') {
        const telegramConfig = options.telegram;
        if (!telegramConfig || telegramConfig.mode !== 'webhook') {
          throw new OrchestratorServiceError(503, 'TELEGRAM_BOT_DISABLED', '未启用 Telegram webhook 入站能力。');
        }
        if (!verifyTelegramWebhookSecret(req.headers, telegramConfig.webhookSecretToken)) {
          throw new OrchestratorServiceError(401, 'TELEGRAM_SECRET_INVALID', 'Telegram secret token 校验失败。');
        }
        const body = await readJson(req);
        const data = await handleTelegramBotInbound(service, body, {
          tenantId: telegramConfig.tenantId,
          projectId: telegramConfig.projectId,
          requireMention: telegramConfig.requireMention,
          botUsername: telegramConfig.botUsername,
          allowedChatIds: telegramConfig.allowedChatIds,
          agentRuntime: options.agentRuntime
        });

        let replyDelivered = false;
        let replyError: string | undefined;
        if (data.replyText) {
          const sent = await sendTelegramMessage(
            {
              apiBaseUrl: telegramConfig.apiBaseUrl,
              botToken: telegramConfig.botToken
            },
            {
              chatId: data.chatId,
              text: data.replyText,
              replyToMessageId: data.replyToMessageId
            }
          );
          if (sent.ok) {
            replyDelivered = true;
          } else {
            replyError = sent.error;
          }
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            ...data,
            replyDelivered,
            replyError
          }
        });
        return;
      }

      const getRequestMatch = path.match(/^\/api\/v1\/requests\/([^/]+)$/);
      if (method === 'GET' && getRequestMatch) {
        const data = await service.getRequestDetail(decodeURIComponent(getRequestMatch[1]!));
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const acceptanceMatch = path.match(/^\/api\/v1\/requests\/([^/]+)\/acceptance$/);
      if (method === 'POST' && acceptanceMatch) {
        const body = (await readJson(req)) as OrchestratorAcceptanceInput;
        const data = await service.submitAcceptance(decodeURIComponent(acceptanceMatch[1]!), body);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/approvals') {
        const body = (await readJson(req)) as OrchestratorApprovalInput;
        const data = await service.submitApproval(body);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const resumeMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/resume$/);
      if (method === 'POST' && resumeMatch) {
        const body = (await readJson(req)) as OrchestratorRunResumeInput;
        const data = await service.resumeRun(decodeURIComponent(resumeMatch[1]!), body);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const webhookMatch = path.match(/^\/api\/v1\/channels\/([^/]+)\/webhook$/);
      if (method === 'POST' && webhookMatch) {
        const channel = decodeURIComponent(webhookMatch[1]!);
        const rawBody = await readJson(req);
        const body = normalizeChannelWebhook(channel, rawBody as OrchestratorWebhookPayload);
        const data = await service.receiveWebhook(channel, body);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const requestNotificationsMatch = path.match(/^\/api\/v1\/requests\/([^/]+)\/notifications$/);
      if (method === 'GET' && requestNotificationsMatch) {
        const requestId = decodeURIComponent(requestNotificationsMatch[1]!);
        const data = await service.listNotifications({ requestId });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'GET' && path === '/api/v1/notifications') {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const requestId = url.searchParams.get('requestId') ?? undefined;
        const status = url.searchParams.get('status') as 'pending' | 'sent' | 'failed' | 'acked' | null;
        const data = await service.listNotifications({
          requestId,
          status: status ?? undefined
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const ackNotificationMatch = path.match(/^\/api\/v1\/notifications\/([^/]+)\/ack$/);
      if (method === 'POST' && ackNotificationMatch) {
        const body = (await readJson(req)) as { actorId: string };
        if (!body?.actorId || typeof body.actorId !== 'string') {
          throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'actorId 必填。');
        }
        const data = await service.ackNotification(decodeURIComponent(ackNotificationMatch[1]!), body.actorId);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'GET' && path === '/api/v1/metrics/summary') {
        const data = await service.getMetricsSummary();
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const resultCardMatch = path.match(/^\/api\/v1\/deliveries\/([^/]+)\/result-card$/);
      if (method === 'GET' && resultCardMatch) {
        const data = await service.getResultCard(decodeURIComponent(resultCardMatch[1]!));
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const demoLinkMatch = path.match(/^\/api\/v1\/deliveries\/([^/]+)\/demo-link$/);
      if (method === 'GET' && demoLinkMatch) {
        const data = await service.getDemoLink(decodeURIComponent(demoLinkMatch[1]!));
        sendJson(res, 200, { ok: true, data });
        return;
      }

      if (method === 'POST' && path === '/api/v1/system/tick') {
        const body = (await readJson(req)) as { now?: string };
        const now = body?.now ? new Date(body.now) : undefined;
        if (body?.now && Number.isNaN(now?.getTime())) {
          throw new OrchestratorServiceError(400, 'INVALID_NOW', 'now 字段不是合法 ISO 时间。');
        }
        const data = await service.tick(now);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '接口不存在。' } });
    } catch (error) {
      if (error instanceof OrchestratorServiceError || error instanceof AssistantServiceError) {
        sendJson(res, error.statusCode, { ok: false, error: { code: error.code, message: error.message } });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message } });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    server,
    address: server.address() as AddressInfo | null,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
}
