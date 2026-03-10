import type {
  OrchestratorDingTalkWebhookPayload,
  OrchestratorTelegramWebhookPayload,
  OrchestratorWebhookPayload,
  OrchestratorWecomWebhookPayload
} from '@specwave/contracts';
import { OrchestratorServiceError } from './orchestratorService';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', `${field} 必须是非空字符串。`);
  }
  return value.trim();
}

function ensureTenantProject(payload: unknown): { tenantId: string; projectId: string } {
  if (!payload || typeof payload !== 'object') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'webhook payload 必须是对象。');
  }
  const record = payload as Record<string, unknown>;
  return {
    tenantId: requireString(record.tenantId, 'tenantId'),
    projectId: requireString(record.projectId, 'projectId')
  };
}

function fromWebchat(payload: unknown): OrchestratorWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'webchat payload 必须是对象。');
  }
  const record = payload as Record<string, unknown>;
  const { tenantId, projectId } = ensureTenantProject(record);
  const user = (record.user && typeof record.user === 'object' ? record.user : {}) as Record<string, unknown>;
  return {
    externalChatId: requireString(record.chatId ?? record.externalChatId, 'chatId'),
    threadId: typeof record.threadId === 'string' ? record.threadId : undefined,
    userId: requireString(user.id ?? record.userId, 'user.id'),
    userName: typeof user.name === 'string' ? user.name : typeof record.userName === 'string' ? record.userName : undefined,
    message: requireString(record.text ?? record.message, 'text'),
    tenantId,
    projectId,
    idempotencyKey: requireString(record.idempotencyKey, 'idempotencyKey'),
    riskLevel: typeof record.riskLevel === 'string' ? (record.riskLevel as OrchestratorWebhookPayload['riskLevel']) : undefined
  };
}

function fromDingtalk(payload: unknown): OrchestratorWebhookPayload {
  const source = payload as OrchestratorDingTalkWebhookPayload;
  const { tenantId, projectId } = ensureTenantProject(source);
  const message = requireString(source?.text?.content, 'text.content');
  const msgId = requireString(source?.msgId, 'msgId');
  const conversationId = requireString(source?.conversationId, 'conversationId');
  const senderUserId = requireString(source?.senderUserId, 'senderUserId');
  return {
    externalChatId: conversationId,
    threadId: msgId,
    userId: senderUserId,
    userName: typeof source.senderNick === 'string' ? source.senderNick : undefined,
    message,
    tenantId,
    projectId,
    idempotencyKey: `dingtalk:${msgId}`,
    riskLevel: source.riskLevel
  };
}

function fromWecom(payload: unknown): OrchestratorWebhookPayload {
  const source = payload as OrchestratorWecomWebhookPayload;
  const { tenantId, projectId } = ensureTenantProject(source);
  const msgid = requireString(source?.msgid, 'msgid');
  return {
    externalChatId: requireString(source?.conversationId, 'conversationId'),
    threadId: msgid,
    userId: requireString(source?.from, 'from'),
    userName: typeof source.fromName === 'string' ? source.fromName : undefined,
    message: requireString(source?.content, 'content'),
    tenantId,
    projectId,
    idempotencyKey: `wecom:${msgid}`,
    riskLevel: source.riskLevel
  };
}

function fromTelegram(payload: unknown): OrchestratorWebhookPayload {
  const source = payload as OrchestratorTelegramWebhookPayload;
  const { tenantId, projectId } = ensureTenantProject(source);
  const chatId = source?.message?.chat?.id;
  const messageId = source?.message?.message_id;
  const text = source?.message?.text;
  const firstName = source?.message?.from?.first_name ?? '';
  const lastName = source?.message?.from?.last_name ?? '';
  const username = source?.message?.from?.username;

  if ((typeof chatId !== 'string' && typeof chatId !== 'number') || !messageId || typeof text !== 'string') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'telegram payload 缺少必要字段。');
  }
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    externalChatId: `tg:${String(chatId)}`,
    threadId: String(messageId),
    userId: `tg-chat:${String(chatId)}`,
    userName: displayName || username,
    message: text.trim(),
    tenantId,
    projectId,
    idempotencyKey: `telegram:${String(source.update_id)}`,
    riskLevel: source.riskLevel
  };
}

export function normalizeChannelWebhook(channel: string, payload: unknown): OrchestratorWebhookPayload {
  const key = channel.toLowerCase();
  if (key === 'webchat') return fromWebchat(payload);
  if (key === 'dingtalk') return fromDingtalk(payload);
  if (key === 'wecom') return fromWecom(payload);
  if (key === 'telegram') return fromTelegram(payload);
  throw new OrchestratorServiceError(400, 'UNSUPPORTED_CHANNEL', `不支持的渠道：${channel}`);
}
