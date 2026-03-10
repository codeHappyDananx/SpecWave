import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DingtalkConnectorConfig = {
  webhook: string;
  secret?: string;
  keyword?: string;
};

export type DingtalkAppbotConnectorConfig = {
  tenantId: string;
  projectId: string;
  requireAt: boolean;
  signSecret?: string;
  botName?: string;
};

export type DingtalkStreamCardCallbackType = 'STREAM' | 'HTTP';

export type DingtalkStreamCardConfig = {
  enabled: boolean;
  cardTemplateId: string;
  streamKey: string;
  initialContent: string;
  chunkSize: number;
  chunkDelayMs: number;
  callbackType: DingtalkStreamCardCallbackType;
  callbackRouteKey?: string;
  fallbackToSessionWebhook: boolean;
};

export type DingtalkStreamMediaConfig = {
  resolveDownloadUrl: boolean;
};

export type DingtalkStreamConnectorConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  projectId: string;
  requireAt: boolean;
  botName?: string;
  apiBaseUrl: string;
  card?: DingtalkStreamCardConfig;
  media: DingtalkStreamMediaConfig;
};

export type ProactiveGreetingConfig = {
  enabled: boolean;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  dailyMax: number;
  checkIntervalSeconds: number;
  quietHours?: {
    startHour: number;
    endHour: number;
  };
  templates: string[];
};

export type DesktopAutomationBackend = 'powershell';
export type DesktopAutomationPreferredBrowser = 'default' | 'msedge' | 'chrome';

export type DesktopAutomationConfig = {
  enabled: boolean;
  backend: DesktopAutomationBackend;
  timeoutMs: number;
  preferredBrowser: DesktopAutomationPreferredBrowser;
  dryRun: boolean;
};

export type AgentBridgeBackend = 'codex' | 'claude' | 'command' | 'http';
export type AgentBridgeStyleMode = 'natural' | 'hybrid' | 'formal';

export type AgentBridgeConfig = {
  enabled: boolean;
  backend: AgentBridgeBackend;
  timeoutMs: number;
  workdir: string;
  historyLimit: number;
  model?: string;
  command?: string;
  commandArgs: string[];
  endpoint?: string;
  skillsRoot: string;
  skills: {
    roles: string[];
    prompts: string[];
    extraFiles: string[];
  };
  style: {
    mode: AgentBridgeStyleMode;
    chatParticles: string[];
    formalKeywords: string[];
    workIntentKeywords: string[];
  };
};

export type TelegramConnectorMode = 'polling' | 'webhook';

export type TelegramConnectorConfig = {
  botToken: string;
  tenantId: string;
  projectId: string;
  mode: TelegramConnectorMode;
  requireMention: boolean;
  botUsername?: string;
  allowedChatIds?: string[];
  webhookSecretToken?: string;
  apiBaseUrl: string;
  pollingTimeoutSec: number;
  pollingBackoffMs: number;
};

export type OrchestratorConnectorConfig = {
  dingtalk?: DingtalkConnectorConfig;
  dingtalkAppbot?: DingtalkAppbotConnectorConfig;
  dingtalkStream?: DingtalkStreamConnectorConfig;
  telegram?: TelegramConnectorConfig;
  proactiveGreeting?: ProactiveGreetingConfig;
  desktopAutomation?: DesktopAutomationConfig;
  agentBridge?: AgentBridgeConfig;
};

type RawConnectorConfig = {
  dingtalk?: {
    webhook?: unknown;
    secret?: unknown;
    keyword?: unknown;
  };
  dingtalkAppbot?: {
    tenantId?: unknown;
    projectId?: unknown;
    requireAt?: unknown;
    signSecret?: unknown;
    botName?: unknown;
  };
  dingtalkStream?: {
    clientId?: unknown;
    clientSecret?: unknown;
    tenantId?: unknown;
    projectId?: unknown;
    requireAt?: unknown;
    botName?: unknown;
    apiBaseUrl?: unknown;
    card?: {
      enabled?: unknown;
      cardTemplateId?: unknown;
      streamKey?: unknown;
      initialContent?: unknown;
      chunkSize?: unknown;
      chunkDelayMs?: unknown;
      callbackType?: unknown;
      callbackRouteKey?: unknown;
      fallbackToSessionWebhook?: unknown;
    };
    media?: {
      resolveDownloadUrl?: unknown;
    };
  };
  telegram?: {
    botToken?: unknown;
    tenantId?: unknown;
    projectId?: unknown;
    mode?: unknown;
    requireMention?: unknown;
    botUsername?: unknown;
    allowedChatIds?: unknown;
    webhookSecretToken?: unknown;
    apiBaseUrl?: unknown;
    pollingTimeoutSec?: unknown;
    pollingBackoffMs?: unknown;
  };
  proactiveGreeting?: {
    enabled?: unknown;
    minIntervalMinutes?: unknown;
    maxIntervalMinutes?: unknown;
    dailyMax?: unknown;
    checkIntervalSeconds?: unknown;
    quietStartHour?: unknown;
    quietEndHour?: unknown;
    templates?: unknown;
  };
  desktopAutomation?: {
    enabled?: unknown;
    backend?: unknown;
    timeoutMs?: unknown;
    preferredBrowser?: unknown;
    dryRun?: unknown;
  };
  agentBridge?: {
    enabled?: unknown;
    backend?: unknown;
    timeoutMs?: unknown;
    workdir?: unknown;
    historyLimit?: unknown;
    model?: unknown;
    command?: unknown;
    commandArgs?: unknown;
    endpoint?: unknown;
    skillsRoot?: unknown;
    roles?: unknown;
    prompts?: unknown;
    extraFiles?: unknown;
    style?: {
      mode?: unknown;
      chatParticles?: unknown;
      formalKeywords?: unknown;
      workIntentKeywords?: unknown;
    };
    skills?: {
      roles?: unknown;
      prompts?: unknown;
      extraFiles?: unknown;
    };
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBoolean(value: unknown, key: string): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  throw new Error(`[orchestrator] ${key} 仅支持 true/false。`);
}

function normalizeInteger(value: unknown, key: string, min: number): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < min) {
      throw new Error(`[orchestrator] ${key} 必须是 >= ${min} 的整数。`);
    }
    return value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`[orchestrator] ${key} 必须是 >= ${min} 的整数。`);
  }
  return parsed;
}

function normalizeHour(value: unknown, key: string): number | undefined {
  const parsed = normalizeInteger(value, key, 0);
  if (parsed === undefined) return undefined;
  if (parsed > 23) {
    throw new Error(`[orchestrator] ${key} 必须在 0-23 之间。`);
  }
  return parsed;
}

function normalizeTelegramMode(value: unknown, key: string): TelegramConnectorMode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'polling' || normalized === 'webhook') return normalized;
  throw new Error(`[orchestrator] ${key} 仅支持 polling/webhook。`);
}

function normalizeDingtalkCardCallbackType(value: unknown, key: string): DingtalkStreamCardCallbackType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === 'STREAM' || normalized === 'HTTP') return normalized;
  throw new Error(`[orchestrator] ${key} 仅支持 STREAM/HTTP。`);
}

function normalizeAgentBridgeBackend(value: unknown, key: string): AgentBridgeBackend | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'codex' || normalized === 'claude' || normalized === 'command' || normalized === 'http') {
    return normalized;
  }
  throw new Error(`[orchestrator] ${key} 仅支持 codex/claude/command/http。`);
}

function normalizeAgentBridgeStyleMode(value: unknown, key: string): AgentBridgeStyleMode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'natural' || normalized === 'hybrid' || normalized === 'formal') return normalized;
  throw new Error(`[orchestrator] ${key} 仅支持 natural/hybrid/formal。`);
}

function normalizeDesktopAutomationBackend(value: unknown, key: string): DesktopAutomationBackend | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'powershell') return normalized;
  throw new Error(`[orchestrator] ${key} 仅支持 powershell。`);
}

function normalizeDesktopPreferredBrowser(value: unknown, key: string): DesktopAutomationPreferredBrowser | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'default' || normalized === 'msedge' || normalized === 'chrome') return normalized;
  throw new Error(`[orchestrator] ${key} 仅支持 default/msedge/chrome。`);
}

function normalizeStringArray(value: unknown, key: string): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function hasAnyValue(values: Array<unknown>): boolean {
  return values.some((value) => value !== undefined && value !== null && value !== '');
}

function resolveConnectorFilePath(): string {
  const fromEnv = readOptionalEnv('SPECWAVE_ORCHESTRATOR_CONNECTORS_FILE');
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(__dirname, '..', '..', '..', '.specwave', 'orchestrator-connectors.local.json');
}

function normalizeUrl(value: string, key: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[orchestrator] ${key} 不是合法 URL。`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`[orchestrator] ${key} 仅支持 http/https。`);
  }
  return parsed.toString();
}

function normalizeApiBaseUrl(value: string, key: string): string {
  const url = normalizeUrl(value, key);
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function loadFileConfig(): Promise<RawConnectorConfig> {
  const filePath = resolveConnectorFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RawConnectorConfig;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') return {};
    throw error;
  }
}

export async function loadConnectorConfig(): Promise<OrchestratorConnectorConfig> {
  const fileConfig = await loadFileConfig();

  const fileWebhook =
    typeof fileConfig.dingtalk?.webhook === 'string' && fileConfig.dingtalk.webhook.trim()
      ? fileConfig.dingtalk.webhook.trim()
      : undefined;
  const fileSecret =
    typeof fileConfig.dingtalk?.secret === 'string' && fileConfig.dingtalk.secret.trim()
      ? fileConfig.dingtalk.secret.trim()
      : undefined;
  const fileKeyword =
    typeof fileConfig.dingtalk?.keyword === 'string' && fileConfig.dingtalk.keyword.trim()
      ? fileConfig.dingtalk.keyword.trim()
      : undefined;

  const envWebhook = readOptionalEnv('SPECWAVE_DINGTALK_ROBOT_WEBHOOK');
  const envSecret = readOptionalEnv('SPECWAVE_DINGTALK_ROBOT_SECRET');
  const envKeyword = readOptionalEnv('SPECWAVE_DINGTALK_ROBOT_KEYWORD');

  const webhook = envWebhook ?? fileWebhook;
  const secret = envSecret ?? fileSecret;
  const keyword = envKeyword ?? fileKeyword;

  const result: OrchestratorConnectorConfig = {};
  if (webhook) {
    result.dingtalk = {
      webhook: normalizeUrl(webhook, 'SPECWAVE_DINGTALK_ROBOT_WEBHOOK'),
      secret,
      keyword
    };
  }

  const fileAppbotTenantId =
    typeof fileConfig.dingtalkAppbot?.tenantId === 'string' && fileConfig.dingtalkAppbot.tenantId.trim()
      ? fileConfig.dingtalkAppbot.tenantId.trim()
      : undefined;
  const fileAppbotProjectId =
    typeof fileConfig.dingtalkAppbot?.projectId === 'string' && fileConfig.dingtalkAppbot.projectId.trim()
      ? fileConfig.dingtalkAppbot.projectId.trim()
      : undefined;
  const fileAppbotRequireAt = normalizeBoolean(fileConfig.dingtalkAppbot?.requireAt, 'dingtalkAppbot.requireAt');
  const fileAppbotSignSecret =
    typeof fileConfig.dingtalkAppbot?.signSecret === 'string' && fileConfig.dingtalkAppbot.signSecret.trim()
      ? fileConfig.dingtalkAppbot.signSecret.trim()
      : undefined;
  const fileAppbotBotName =
    typeof fileConfig.dingtalkAppbot?.botName === 'string' && fileConfig.dingtalkAppbot.botName.trim()
      ? fileConfig.dingtalkAppbot.botName.trim()
      : undefined;

  const envAppbotTenantId = readOptionalEnv('SPECWAVE_DINGTALK_APPBOT_TENANT_ID');
  const envAppbotProjectId = readOptionalEnv('SPECWAVE_DINGTALK_APPBOT_PROJECT_ID');
  const envAppbotRequireAt = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DINGTALK_APPBOT_REQUIRE_AT'),
    'SPECWAVE_DINGTALK_APPBOT_REQUIRE_AT'
  );
  const envAppbotSignSecret = readOptionalEnv('SPECWAVE_DINGTALK_APPBOT_SIGN_SECRET');
  const envAppbotBotName = readOptionalEnv('SPECWAVE_DINGTALK_APPBOT_BOT_NAME');

  const appbotTenantId = envAppbotTenantId ?? fileAppbotTenantId;
  const appbotProjectId = envAppbotProjectId ?? fileAppbotProjectId;
  if (appbotTenantId || appbotProjectId) {
    if (!appbotTenantId || !appbotProjectId) {
      throw new Error('[orchestrator] dingtalkAppbot 启用时 tenantId/projectId 必须同时配置。');
    }
    result.dingtalkAppbot = {
      tenantId: appbotTenantId,
      projectId: appbotProjectId,
      requireAt: envAppbotRequireAt ?? fileAppbotRequireAt ?? true,
      signSecret: envAppbotSignSecret ?? fileAppbotSignSecret,
      botName: envAppbotBotName ?? fileAppbotBotName
    };
  }

  const fileStreamClientId =
    typeof fileConfig.dingtalkStream?.clientId === 'string' && fileConfig.dingtalkStream.clientId.trim()
      ? fileConfig.dingtalkStream.clientId.trim()
      : undefined;
  const fileStreamClientSecret =
    typeof fileConfig.dingtalkStream?.clientSecret === 'string' && fileConfig.dingtalkStream.clientSecret.trim()
      ? fileConfig.dingtalkStream.clientSecret.trim()
      : undefined;
  const fileStreamTenantId =
    typeof fileConfig.dingtalkStream?.tenantId === 'string' && fileConfig.dingtalkStream.tenantId.trim()
      ? fileConfig.dingtalkStream.tenantId.trim()
      : undefined;
  const fileStreamProjectId =
    typeof fileConfig.dingtalkStream?.projectId === 'string' && fileConfig.dingtalkStream.projectId.trim()
      ? fileConfig.dingtalkStream.projectId.trim()
      : undefined;
  const fileStreamRequireAt = normalizeBoolean(fileConfig.dingtalkStream?.requireAt, 'dingtalkStream.requireAt');
  const fileStreamBotName =
    typeof fileConfig.dingtalkStream?.botName === 'string' && fileConfig.dingtalkStream.botName.trim()
      ? fileConfig.dingtalkStream.botName.trim()
      : undefined;
  const fileStreamApiBaseUrl =
    typeof fileConfig.dingtalkStream?.apiBaseUrl === 'string' && fileConfig.dingtalkStream.apiBaseUrl.trim()
      ? fileConfig.dingtalkStream.apiBaseUrl.trim()
      : undefined;
  const fileStreamCardEnabled = normalizeBoolean(fileConfig.dingtalkStream?.card?.enabled, 'dingtalkStream.card.enabled');
  const fileStreamCardTemplateId =
    typeof fileConfig.dingtalkStream?.card?.cardTemplateId === 'string' &&
    fileConfig.dingtalkStream.card.cardTemplateId.trim()
      ? fileConfig.dingtalkStream.card.cardTemplateId.trim()
      : undefined;
  const fileStreamCardStreamKey =
    typeof fileConfig.dingtalkStream?.card?.streamKey === 'string' && fileConfig.dingtalkStream.card.streamKey.trim()
      ? fileConfig.dingtalkStream.card.streamKey.trim()
      : undefined;
  const fileStreamCardInitialContent =
    typeof fileConfig.dingtalkStream?.card?.initialContent === 'string' &&
    fileConfig.dingtalkStream.card.initialContent.trim()
      ? fileConfig.dingtalkStream.card.initialContent.trim()
      : undefined;
  const fileStreamCardChunkSize = normalizeInteger(fileConfig.dingtalkStream?.card?.chunkSize, 'dingtalkStream.card.chunkSize', 8);
  const fileStreamCardChunkDelayMs = normalizeInteger(
    fileConfig.dingtalkStream?.card?.chunkDelayMs,
    'dingtalkStream.card.chunkDelayMs',
    0
  );
  const fileStreamCardCallbackType = normalizeDingtalkCardCallbackType(
    fileConfig.dingtalkStream?.card?.callbackType,
    'dingtalkStream.card.callbackType'
  );
  const fileStreamCardCallbackRouteKey =
    typeof fileConfig.dingtalkStream?.card?.callbackRouteKey === 'string' &&
    fileConfig.dingtalkStream.card.callbackRouteKey.trim()
      ? fileConfig.dingtalkStream.card.callbackRouteKey.trim()
      : undefined;
  const fileStreamCardFallbackToSessionWebhook = normalizeBoolean(
    fileConfig.dingtalkStream?.card?.fallbackToSessionWebhook,
    'dingtalkStream.card.fallbackToSessionWebhook'
  );
  const fileStreamMediaResolveDownloadUrl = normalizeBoolean(
    fileConfig.dingtalkStream?.media?.resolveDownloadUrl,
    'dingtalkStream.media.resolveDownloadUrl'
  );

  const envStreamClientId = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CLIENT_ID');
  const envStreamClientSecret = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CLIENT_SECRET');
  const envStreamTenantId = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_TENANT_ID');
  const envStreamProjectId = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_PROJECT_ID');
  const envStreamRequireAt = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_REQUIRE_AT'),
    'SPECWAVE_DINGTALK_STREAM_REQUIRE_AT'
  );
  const envStreamBotName = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_BOT_NAME');
  const envStreamApiBaseUrl = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_API_BASE_URL');
  const envStreamCardEnabled = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_ENABLED'),
    'SPECWAVE_DINGTALK_STREAM_CARD_ENABLED'
  );
  const envStreamCardTemplateId = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_TEMPLATE_ID');
  const envStreamCardStreamKey = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_STREAM_KEY');
  const envStreamCardInitialContent = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_INITIAL_CONTENT');
  const envStreamCardChunkSize = normalizeInteger(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_SIZE'),
    'SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_SIZE',
    8
  );
  const envStreamCardChunkDelayMs = normalizeInteger(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_DELAY_MS'),
    'SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_DELAY_MS',
    0
  );
  const envStreamCardCallbackType = normalizeDingtalkCardCallbackType(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_CALLBACK_TYPE'),
    'SPECWAVE_DINGTALK_STREAM_CARD_CALLBACK_TYPE'
  );
  const envStreamCardCallbackRouteKey = readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_CALLBACK_ROUTE_KEY');
  const envStreamCardFallbackToSessionWebhook = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_CARD_FALLBACK_TO_SESSION_WEBHOOK'),
    'SPECWAVE_DINGTALK_STREAM_CARD_FALLBACK_TO_SESSION_WEBHOOK'
  );
  const envStreamMediaResolveDownloadUrl = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DINGTALK_STREAM_MEDIA_RESOLVE_DOWNLOAD_URL'),
    'SPECWAVE_DINGTALK_STREAM_MEDIA_RESOLVE_DOWNLOAD_URL'
  );

  const streamClientId = envStreamClientId ?? fileStreamClientId;
  const streamClientSecret = envStreamClientSecret ?? fileStreamClientSecret;
  const streamTenantId = envStreamTenantId ?? fileStreamTenantId ?? appbotTenantId;
  const streamProjectId = envStreamProjectId ?? fileStreamProjectId ?? appbotProjectId;
  if (streamClientId || streamClientSecret || streamTenantId || streamProjectId) {
    if (!streamClientId || !streamClientSecret || !streamTenantId || !streamProjectId) {
      throw new Error('[orchestrator] dingtalkStream 启用时 clientId/clientSecret/tenantId/projectId 必须同时配置。');
    }
    const streamApiBaseUrl = normalizeApiBaseUrl(
      envStreamApiBaseUrl ?? fileStreamApiBaseUrl ?? 'https://api.dingtalk.com',
      'SPECWAVE_DINGTALK_STREAM_API_BASE_URL'
    );
    const streamCardTemplateId = envStreamCardTemplateId ?? fileStreamCardTemplateId;
    const streamCardEnabled = envStreamCardEnabled ?? fileStreamCardEnabled ?? Boolean(streamCardTemplateId);
    if (streamCardEnabled && !streamCardTemplateId) {
      throw new Error('[orchestrator] dingtalkStream.card.enabled=true 时必须配置 cardTemplateId。');
    }
    result.dingtalkStream = {
      clientId: streamClientId,
      clientSecret: streamClientSecret,
      tenantId: streamTenantId,
      projectId: streamProjectId,
      requireAt: envStreamRequireAt ?? fileStreamRequireAt ?? true,
      botName: envStreamBotName ?? fileStreamBotName ?? envAppbotBotName ?? fileAppbotBotName,
      apiBaseUrl: streamApiBaseUrl,
      card: streamCardEnabled
        ? {
            enabled: true,
            cardTemplateId: streamCardTemplateId!,
            streamKey: envStreamCardStreamKey ?? fileStreamCardStreamKey ?? 'content',
            initialContent: envStreamCardInitialContent ?? fileStreamCardInitialContent ?? '正在整理回复，请稍等…',
            chunkSize: envStreamCardChunkSize ?? fileStreamCardChunkSize ?? 28,
            chunkDelayMs: envStreamCardChunkDelayMs ?? fileStreamCardChunkDelayMs ?? 200,
            callbackType: envStreamCardCallbackType ?? fileStreamCardCallbackType ?? 'STREAM',
            callbackRouteKey: envStreamCardCallbackRouteKey ?? fileStreamCardCallbackRouteKey,
            fallbackToSessionWebhook:
              envStreamCardFallbackToSessionWebhook ?? fileStreamCardFallbackToSessionWebhook ?? true
          }
        : undefined,
      media: {
        resolveDownloadUrl: envStreamMediaResolveDownloadUrl ?? fileStreamMediaResolveDownloadUrl ?? true
      }
    };
  }

  const fileTelegramBotToken =
    typeof fileConfig.telegram?.botToken === 'string' && fileConfig.telegram.botToken.trim()
      ? fileConfig.telegram.botToken.trim()
      : undefined;
  const fileTelegramTenantId =
    typeof fileConfig.telegram?.tenantId === 'string' && fileConfig.telegram.tenantId.trim()
      ? fileConfig.telegram.tenantId.trim()
      : undefined;
  const fileTelegramProjectId =
    typeof fileConfig.telegram?.projectId === 'string' && fileConfig.telegram.projectId.trim()
      ? fileConfig.telegram.projectId.trim()
      : undefined;
  const fileTelegramMode = normalizeTelegramMode(fileConfig.telegram?.mode, 'telegram.mode');
  const fileTelegramRequireMention = normalizeBoolean(fileConfig.telegram?.requireMention, 'telegram.requireMention');
  const fileTelegramBotUsername =
    typeof fileConfig.telegram?.botUsername === 'string' && fileConfig.telegram.botUsername.trim()
      ? fileConfig.telegram.botUsername.trim()
      : undefined;
  const fileTelegramAllowedChatIds = normalizeStringArray(fileConfig.telegram?.allowedChatIds, 'telegram.allowedChatIds');
  const fileTelegramWebhookSecretToken =
    typeof fileConfig.telegram?.webhookSecretToken === 'string' && fileConfig.telegram.webhookSecretToken.trim()
      ? fileConfig.telegram.webhookSecretToken.trim()
      : undefined;
  const fileTelegramApiBaseUrl =
    typeof fileConfig.telegram?.apiBaseUrl === 'string' && fileConfig.telegram.apiBaseUrl.trim()
      ? fileConfig.telegram.apiBaseUrl.trim()
      : undefined;
  const fileTelegramPollingTimeoutSec = normalizeInteger(
    fileConfig.telegram?.pollingTimeoutSec,
    'telegram.pollingTimeoutSec',
    1
  );
  const fileTelegramPollingBackoffMs = normalizeInteger(
    fileConfig.telegram?.pollingBackoffMs,
    'telegram.pollingBackoffMs',
    100
  );

  const envTelegramBotToken = readOptionalEnv('SPECWAVE_TELEGRAM_BOT_TOKEN');
  const envTelegramTenantId = readOptionalEnv('SPECWAVE_TELEGRAM_TENANT_ID');
  const envTelegramProjectId = readOptionalEnv('SPECWAVE_TELEGRAM_PROJECT_ID');
  const envTelegramMode = normalizeTelegramMode(
    readOptionalEnv('SPECWAVE_TELEGRAM_MODE'),
    'SPECWAVE_TELEGRAM_MODE'
  );
  const envTelegramRequireMention = normalizeBoolean(
    readOptionalEnv('SPECWAVE_TELEGRAM_REQUIRE_MENTION'),
    'SPECWAVE_TELEGRAM_REQUIRE_MENTION'
  );
  const envTelegramBotUsername = readOptionalEnv('SPECWAVE_TELEGRAM_BOT_USERNAME');
  const envTelegramAllowedChatIds = normalizeStringArray(
    readOptionalEnv('SPECWAVE_TELEGRAM_ALLOWED_CHAT_IDS'),
    'SPECWAVE_TELEGRAM_ALLOWED_CHAT_IDS'
  );
  const envTelegramWebhookSecretToken = readOptionalEnv('SPECWAVE_TELEGRAM_WEBHOOK_SECRET_TOKEN');
  const envTelegramApiBaseUrl = readOptionalEnv('SPECWAVE_TELEGRAM_API_BASE_URL');
  const envTelegramPollingTimeoutSec = normalizeInteger(
    readOptionalEnv('SPECWAVE_TELEGRAM_POLLING_TIMEOUT_SEC'),
    'SPECWAVE_TELEGRAM_POLLING_TIMEOUT_SEC',
    1
  );
  const envTelegramPollingBackoffMs = normalizeInteger(
    readOptionalEnv('SPECWAVE_TELEGRAM_POLLING_BACKOFF_MS'),
    'SPECWAVE_TELEGRAM_POLLING_BACKOFF_MS',
    100
  );

  const telegramBotToken = envTelegramBotToken ?? fileTelegramBotToken;
  const telegramTenantId = envTelegramTenantId ?? fileTelegramTenantId;
  const telegramProjectId = envTelegramProjectId ?? fileTelegramProjectId;
  const telegramMode = envTelegramMode ?? fileTelegramMode ?? 'polling';
  const telegramApiBaseUrl = normalizeApiBaseUrl(
    envTelegramApiBaseUrl ?? fileTelegramApiBaseUrl ?? 'https://api.telegram.org',
    'SPECWAVE_TELEGRAM_API_BASE_URL'
  );
  const telegramHasAnyConfig = Boolean(
    telegramBotToken ||
      telegramTenantId ||
      telegramProjectId ||
      envTelegramMode ||
      fileTelegramMode ||
      envTelegramRequireMention !== undefined ||
      fileTelegramRequireMention !== undefined ||
      envTelegramBotUsername ||
      fileTelegramBotUsername ||
      envTelegramAllowedChatIds ||
      fileTelegramAllowedChatIds ||
      envTelegramWebhookSecretToken ||
      fileTelegramWebhookSecretToken
  );
  if (telegramHasAnyConfig) {
    if (!telegramBotToken || !telegramTenantId || !telegramProjectId) {
      throw new Error('[orchestrator] telegram 启用时 botToken/tenantId/projectId 必须同时配置。');
    }
    const botUsernameRaw = envTelegramBotUsername ?? fileTelegramBotUsername;
    const botUsername = botUsernameRaw ? botUsernameRaw.replace(/^@+/, '') : undefined;
    result.telegram = {
      botToken: telegramBotToken,
      tenantId: telegramTenantId,
      projectId: telegramProjectId,
      mode: telegramMode,
      requireMention: envTelegramRequireMention ?? fileTelegramRequireMention ?? false,
      botUsername,
      allowedChatIds: envTelegramAllowedChatIds ?? fileTelegramAllowedChatIds,
      webhookSecretToken: envTelegramWebhookSecretToken ?? fileTelegramWebhookSecretToken,
      apiBaseUrl: telegramApiBaseUrl,
      pollingTimeoutSec: envTelegramPollingTimeoutSec ?? fileTelegramPollingTimeoutSec ?? 20,
      pollingBackoffMs: envTelegramPollingBackoffMs ?? fileTelegramPollingBackoffMs ?? 1500
    };
  }

  const fileGreetingEnabled = normalizeBoolean(fileConfig.proactiveGreeting?.enabled, 'proactiveGreeting.enabled');
  const fileGreetingMinInterval = normalizeInteger(
    fileConfig.proactiveGreeting?.minIntervalMinutes,
    'proactiveGreeting.minIntervalMinutes',
    1
  );
  const fileGreetingMaxInterval = normalizeInteger(
    fileConfig.proactiveGreeting?.maxIntervalMinutes,
    'proactiveGreeting.maxIntervalMinutes',
    1
  );
  const fileGreetingDailyMax = normalizeInteger(fileConfig.proactiveGreeting?.dailyMax, 'proactiveGreeting.dailyMax', 1);
  const fileGreetingCheckSec = normalizeInteger(
    fileConfig.proactiveGreeting?.checkIntervalSeconds,
    'proactiveGreeting.checkIntervalSeconds',
    5
  );
  const fileGreetingQuietStart = normalizeHour(
    fileConfig.proactiveGreeting?.quietStartHour,
    'proactiveGreeting.quietStartHour'
  );
  const fileGreetingQuietEnd = normalizeHour(
    fileConfig.proactiveGreeting?.quietEndHour,
    'proactiveGreeting.quietEndHour'
  );
  const fileGreetingTemplates = normalizeStringArray(fileConfig.proactiveGreeting?.templates, 'proactiveGreeting.templates');

  const envGreetingEnabled = normalizeBoolean(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_ENABLED'),
    'SPECWAVE_PROACTIVE_GREETING_ENABLED'
  );
  const envGreetingMinInterval = normalizeInteger(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_MIN_INTERVAL_MINUTES'),
    'SPECWAVE_PROACTIVE_GREETING_MIN_INTERVAL_MINUTES',
    1
  );
  const envGreetingMaxInterval = normalizeInteger(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_MAX_INTERVAL_MINUTES'),
    'SPECWAVE_PROACTIVE_GREETING_MAX_INTERVAL_MINUTES',
    1
  );
  const envGreetingDailyMax = normalizeInteger(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_DAILY_MAX'),
    'SPECWAVE_PROACTIVE_GREETING_DAILY_MAX',
    1
  );
  const envGreetingCheckSec = normalizeInteger(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_CHECK_INTERVAL_SECONDS'),
    'SPECWAVE_PROACTIVE_GREETING_CHECK_INTERVAL_SECONDS',
    5
  );
  const envGreetingQuietStart = normalizeHour(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_QUIET_START_HOUR'),
    'SPECWAVE_PROACTIVE_GREETING_QUIET_START_HOUR'
  );
  const envGreetingQuietEnd = normalizeHour(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_QUIET_END_HOUR'),
    'SPECWAVE_PROACTIVE_GREETING_QUIET_END_HOUR'
  );
  const envGreetingTemplates = normalizeStringArray(
    readOptionalEnv('SPECWAVE_PROACTIVE_GREETING_TEMPLATES'),
    'SPECWAVE_PROACTIVE_GREETING_TEMPLATES'
  );

  const greetingHasAnyConfig = hasAnyValue([
    envGreetingEnabled,
    fileGreetingEnabled,
    envGreetingMinInterval,
    fileGreetingMinInterval,
    envGreetingMaxInterval,
    fileGreetingMaxInterval,
    envGreetingDailyMax,
    fileGreetingDailyMax,
    envGreetingCheckSec,
    fileGreetingCheckSec,
    envGreetingQuietStart,
    fileGreetingQuietStart,
    envGreetingQuietEnd,
    fileGreetingQuietEnd,
    envGreetingTemplates?.join(','),
    fileGreetingTemplates?.join(',')
  ]);
  if (greetingHasAnyConfig) {
    const enabled = envGreetingEnabled ?? fileGreetingEnabled ?? false;
    const minIntervalMinutes = envGreetingMinInterval ?? fileGreetingMinInterval ?? 60;
    const maxIntervalMinutes = envGreetingMaxInterval ?? fileGreetingMaxInterval ?? 180;
    if (maxIntervalMinutes < minIntervalMinutes) {
      throw new Error('[orchestrator] proactiveGreeting.maxIntervalMinutes 不能小于 minIntervalMinutes。');
    }
    const dailyMax = envGreetingDailyMax ?? fileGreetingDailyMax ?? 3;
    const checkIntervalSeconds = envGreetingCheckSec ?? fileGreetingCheckSec ?? 30;
    const quietStartHour = envGreetingQuietStart ?? fileGreetingQuietStart;
    const quietEndHour = envGreetingQuietEnd ?? fileGreetingQuietEnd;
    const templates =
      envGreetingTemplates ??
      fileGreetingTemplates ??
      ['忙完了吗，记得喝口水。', '今天也辛苦了，我在这儿，想聊就喊我。', '路过提醒一下：别忘了休息眼睛。'];

    result.proactiveGreeting = {
      enabled,
      minIntervalMinutes,
      maxIntervalMinutes,
      dailyMax,
      checkIntervalSeconds,
      quietHours:
        quietStartHour === undefined || quietEndHour === undefined
          ? undefined
          : {
              startHour: quietStartHour,
              endHour: quietEndHour
            },
      templates
    };
  }

  const fileDesktopEnabled = normalizeBoolean(fileConfig.desktopAutomation?.enabled, 'desktopAutomation.enabled');
  const fileDesktopBackend = normalizeDesktopAutomationBackend(fileConfig.desktopAutomation?.backend, 'desktopAutomation.backend');
  const fileDesktopTimeoutMs = normalizeInteger(fileConfig.desktopAutomation?.timeoutMs, 'desktopAutomation.timeoutMs', 1000);
  const fileDesktopPreferredBrowser = normalizeDesktopPreferredBrowser(
    fileConfig.desktopAutomation?.preferredBrowser,
    'desktopAutomation.preferredBrowser'
  );
  const fileDesktopDryRun = normalizeBoolean(fileConfig.desktopAutomation?.dryRun, 'desktopAutomation.dryRun');

  const envDesktopEnabled = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DESKTOP_AUTOMATION_ENABLED'),
    'SPECWAVE_DESKTOP_AUTOMATION_ENABLED'
  );
  const envDesktopBackend = normalizeDesktopAutomationBackend(
    readOptionalEnv('SPECWAVE_DESKTOP_AUTOMATION_BACKEND'),
    'SPECWAVE_DESKTOP_AUTOMATION_BACKEND'
  );
  const envDesktopTimeoutMs = normalizeInteger(
    readOptionalEnv('SPECWAVE_DESKTOP_AUTOMATION_TIMEOUT_MS'),
    'SPECWAVE_DESKTOP_AUTOMATION_TIMEOUT_MS',
    1000
  );
  const envDesktopPreferredBrowser = normalizeDesktopPreferredBrowser(
    readOptionalEnv('SPECWAVE_DESKTOP_AUTOMATION_PREFERRED_BROWSER'),
    'SPECWAVE_DESKTOP_AUTOMATION_PREFERRED_BROWSER'
  );
  const envDesktopDryRun = normalizeBoolean(
    readOptionalEnv('SPECWAVE_DESKTOP_AUTOMATION_DRY_RUN'),
    'SPECWAVE_DESKTOP_AUTOMATION_DRY_RUN'
  );

  const desktopHasAnyConfig = hasAnyValue([
    envDesktopEnabled,
    fileDesktopEnabled,
    envDesktopBackend,
    fileDesktopBackend,
    envDesktopTimeoutMs,
    fileDesktopTimeoutMs,
    envDesktopPreferredBrowser,
    fileDesktopPreferredBrowser,
    envDesktopDryRun,
    fileDesktopDryRun
  ]);
  if (desktopHasAnyConfig) {
    result.desktopAutomation = {
      enabled: envDesktopEnabled ?? fileDesktopEnabled ?? false,
      backend: envDesktopBackend ?? fileDesktopBackend ?? 'powershell',
      timeoutMs: envDesktopTimeoutMs ?? fileDesktopTimeoutMs ?? 45000,
      preferredBrowser: envDesktopPreferredBrowser ?? fileDesktopPreferredBrowser ?? 'default',
      dryRun: envDesktopDryRun ?? fileDesktopDryRun ?? false
    };
  }

  const fileAgentBridgeEnabled = normalizeBoolean(fileConfig.agentBridge?.enabled, 'agentBridge.enabled');
  const fileAgentBridgeBackend = normalizeAgentBridgeBackend(fileConfig.agentBridge?.backend, 'agentBridge.backend');
  const fileAgentBridgeTimeoutMs = normalizeInteger(fileConfig.agentBridge?.timeoutMs, 'agentBridge.timeoutMs', 1000);
  const fileAgentBridgeWorkdir =
    typeof fileConfig.agentBridge?.workdir === 'string' && fileConfig.agentBridge.workdir.trim()
      ? fileConfig.agentBridge.workdir.trim()
      : undefined;
  const fileAgentBridgeHistoryLimit = normalizeInteger(fileConfig.agentBridge?.historyLimit, 'agentBridge.historyLimit', 0);
  const fileAgentBridgeModel =
    typeof fileConfig.agentBridge?.model === 'string' && fileConfig.agentBridge.model.trim()
      ? fileConfig.agentBridge.model.trim()
      : undefined;
  const fileAgentBridgeCommand =
    typeof fileConfig.agentBridge?.command === 'string' && fileConfig.agentBridge.command.trim()
      ? fileConfig.agentBridge.command.trim()
      : undefined;
  const fileAgentBridgeCommandArgs = normalizeStringArray(fileConfig.agentBridge?.commandArgs, 'agentBridge.commandArgs');
  const fileAgentBridgeEndpoint =
    typeof fileConfig.agentBridge?.endpoint === 'string' && fileConfig.agentBridge.endpoint.trim()
      ? fileConfig.agentBridge.endpoint.trim()
      : undefined;
  const fileAgentBridgeSkillsRoot =
    typeof fileConfig.agentBridge?.skillsRoot === 'string' && fileConfig.agentBridge.skillsRoot.trim()
      ? fileConfig.agentBridge.skillsRoot.trim()
      : undefined;
  const fileAgentBridgeRoles =
    normalizeStringArray(fileConfig.agentBridge?.skills?.roles, 'agentBridge.skills.roles') ??
    normalizeStringArray(fileConfig.agentBridge?.roles, 'agentBridge.roles');
  const fileAgentBridgePrompts =
    normalizeStringArray(fileConfig.agentBridge?.skills?.prompts, 'agentBridge.skills.prompts') ??
    normalizeStringArray(fileConfig.agentBridge?.prompts, 'agentBridge.prompts');
  const fileAgentBridgeExtraFiles =
    normalizeStringArray(fileConfig.agentBridge?.skills?.extraFiles, 'agentBridge.skills.extraFiles') ??
    normalizeStringArray(fileConfig.agentBridge?.extraFiles, 'agentBridge.extraFiles');
  const fileAgentBridgeStyleMode =
    normalizeAgentBridgeStyleMode(fileConfig.agentBridge?.style?.mode, 'agentBridge.style.mode') ??
    normalizeAgentBridgeStyleMode((fileConfig.agentBridge as { styleMode?: unknown } | undefined)?.styleMode, 'agentBridge.styleMode');
  const fileAgentBridgeChatParticles =
    normalizeStringArray(fileConfig.agentBridge?.style?.chatParticles, 'agentBridge.style.chatParticles') ??
    normalizeStringArray((fileConfig.agentBridge as { chatParticles?: unknown } | undefined)?.chatParticles, 'agentBridge.chatParticles');
  const fileAgentBridgeFormalKeywords =
    normalizeStringArray(fileConfig.agentBridge?.style?.formalKeywords, 'agentBridge.style.formalKeywords') ??
    normalizeStringArray((fileConfig.agentBridge as { formalKeywords?: unknown } | undefined)?.formalKeywords, 'agentBridge.formalKeywords');
  const fileAgentBridgeWorkIntentKeywords =
    normalizeStringArray(fileConfig.agentBridge?.style?.workIntentKeywords, 'agentBridge.style.workIntentKeywords') ??
    normalizeStringArray(
      (fileConfig.agentBridge as { workIntentKeywords?: unknown } | undefined)?.workIntentKeywords,
      'agentBridge.workIntentKeywords'
    );

  const envAgentBridgeEnabled = normalizeBoolean(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_ENABLED'),
    'SPECWAVE_AGENT_BRIDGE_ENABLED'
  );
  const envAgentBridgeBackend = normalizeAgentBridgeBackend(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_BACKEND'),
    'SPECWAVE_AGENT_BRIDGE_BACKEND'
  );
  const envAgentBridgeTimeoutMs = normalizeInteger(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_TIMEOUT_MS'),
    'SPECWAVE_AGENT_BRIDGE_TIMEOUT_MS',
    1000
  );
  const envAgentBridgeWorkdir = readOptionalEnv('SPECWAVE_AGENT_BRIDGE_WORKDIR');
  const envAgentBridgeHistoryLimit = normalizeInteger(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_HISTORY_LIMIT'),
    'SPECWAVE_AGENT_BRIDGE_HISTORY_LIMIT',
    0
  );
  const envAgentBridgeModel = readOptionalEnv('SPECWAVE_AGENT_BRIDGE_MODEL');
  const envAgentBridgeCommand = readOptionalEnv('SPECWAVE_AGENT_BRIDGE_COMMAND');
  const envAgentBridgeCommandArgs = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_COMMAND_ARGS'),
    'SPECWAVE_AGENT_BRIDGE_COMMAND_ARGS'
  );
  const envAgentBridgeEndpoint = readOptionalEnv('SPECWAVE_AGENT_BRIDGE_ENDPOINT');
  const envAgentBridgeSkillsRoot = readOptionalEnv('SPECWAVE_AGENT_BRIDGE_SKILLS_ROOT');
  const envAgentBridgeRoles = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_ROLES'),
    'SPECWAVE_AGENT_BRIDGE_ROLES'
  );
  const envAgentBridgePrompts = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_PROMPTS'),
    'SPECWAVE_AGENT_BRIDGE_PROMPTS'
  );
  const envAgentBridgeExtraFiles = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_EXTRA_FILES'),
    'SPECWAVE_AGENT_BRIDGE_EXTRA_FILES'
  );
  const envAgentBridgeStyleMode = normalizeAgentBridgeStyleMode(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_STYLE_MODE'),
    'SPECWAVE_AGENT_BRIDGE_STYLE_MODE'
  );
  const envAgentBridgeChatParticles = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_CHAT_PARTICLES'),
    'SPECWAVE_AGENT_BRIDGE_CHAT_PARTICLES'
  );
  const envAgentBridgeFormalKeywords = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_FORMAL_KEYWORDS'),
    'SPECWAVE_AGENT_BRIDGE_FORMAL_KEYWORDS'
  );
  const envAgentBridgeWorkIntentKeywords = normalizeStringArray(
    readOptionalEnv('SPECWAVE_AGENT_BRIDGE_WORK_INTENT_KEYWORDS'),
    'SPECWAVE_AGENT_BRIDGE_WORK_INTENT_KEYWORDS'
  );

  const agentBridgeHasAnyConfig = hasAnyValue([
    envAgentBridgeEnabled,
    fileAgentBridgeEnabled,
    envAgentBridgeBackend,
    fileAgentBridgeBackend,
    envAgentBridgeTimeoutMs,
    fileAgentBridgeTimeoutMs,
    envAgentBridgeWorkdir,
    fileAgentBridgeWorkdir,
    envAgentBridgeHistoryLimit,
    fileAgentBridgeHistoryLimit,
    envAgentBridgeModel,
    fileAgentBridgeModel,
    envAgentBridgeCommand,
    fileAgentBridgeCommand,
    envAgentBridgeCommandArgs?.join(','),
    fileAgentBridgeCommandArgs?.join(','),
    envAgentBridgeEndpoint,
    fileAgentBridgeEndpoint,
    envAgentBridgeSkillsRoot,
    fileAgentBridgeSkillsRoot,
    envAgentBridgeRoles?.join(','),
    fileAgentBridgeRoles?.join(','),
    envAgentBridgePrompts?.join(','),
    fileAgentBridgePrompts?.join(','),
    envAgentBridgeExtraFiles?.join(','),
    fileAgentBridgeExtraFiles?.join(','),
    envAgentBridgeStyleMode,
    fileAgentBridgeStyleMode,
    envAgentBridgeChatParticles?.join(','),
    fileAgentBridgeChatParticles?.join(','),
    envAgentBridgeFormalKeywords?.join(','),
    fileAgentBridgeFormalKeywords?.join(','),
    envAgentBridgeWorkIntentKeywords?.join(','),
    fileAgentBridgeWorkIntentKeywords?.join(',')
  ]);
  if (agentBridgeHasAnyConfig) {
    const enabled = envAgentBridgeEnabled ?? fileAgentBridgeEnabled ?? true;
    const backend = envAgentBridgeBackend ?? fileAgentBridgeBackend ?? 'codex';
    const timeoutMs = envAgentBridgeTimeoutMs ?? fileAgentBridgeTimeoutMs ?? 180000;
    const workdir = path.resolve(envAgentBridgeWorkdir ?? fileAgentBridgeWorkdir ?? path.resolve(__dirname, '..', '..', '..'));
    const historyLimit = envAgentBridgeHistoryLimit ?? fileAgentBridgeHistoryLimit ?? 8;
    const model = envAgentBridgeModel ?? fileAgentBridgeModel;
    const command = envAgentBridgeCommand ?? fileAgentBridgeCommand;
    const commandArgs = envAgentBridgeCommandArgs ?? fileAgentBridgeCommandArgs ?? [];
    const endpointRaw = envAgentBridgeEndpoint ?? fileAgentBridgeEndpoint;
    const endpoint = endpointRaw ? normalizeUrl(endpointRaw, 'SPECWAVE_AGENT_BRIDGE_ENDPOINT') : undefined;
    const skillsRoot = path.resolve(
      envAgentBridgeSkillsRoot ?? fileAgentBridgeSkillsRoot ?? path.resolve(__dirname, '..', '..', '..', '.specwave')
    );
    const roles = envAgentBridgeRoles ?? fileAgentBridgeRoles ?? [];
    const prompts = envAgentBridgePrompts ?? fileAgentBridgePrompts ?? [];
    const extraFiles = envAgentBridgeExtraFiles ?? fileAgentBridgeExtraFiles ?? [];
    const styleMode = envAgentBridgeStyleMode ?? fileAgentBridgeStyleMode ?? 'hybrid';
    const chatParticles = envAgentBridgeChatParticles ?? fileAgentBridgeChatParticles ?? ['好的', '我来处理', '我先看下'];
    const formalKeywords =
      envAgentBridgeFormalKeywords ??
      fileAgentBridgeFormalKeywords ??
      ['方案', '计划', 'spec', '需求文档', '技术方案', '实施方案', '任务拆解', '里程碑', '排期', 'prd'];
    const workIntentKeywords =
      envAgentBridgeWorkIntentKeywords ??
      fileAgentBridgeWorkIntentKeywords ??
      [
        '帮我做',
        '做一个',
        '实现',
        '开发',
        '写代码',
        '修复',
        '排查',
        '接入',
        '配置',
        '部署',
        '测试',
        '联调'
      ];

    if (backend === 'command' && !command) {
      throw new Error('[orchestrator] agentBridge.backend=command 时必须配置 command。');
    }
    if (backend === 'http' && !endpoint) {
      throw new Error('[orchestrator] agentBridge.backend=http 时必须配置 endpoint。');
    }

    result.agentBridge = {
      enabled,
      backend,
      timeoutMs,
      workdir,
      historyLimit,
      model,
      command,
      commandArgs,
      endpoint,
      skillsRoot,
      skills: {
        roles,
        prompts,
        extraFiles
      },
      style: {
        mode: styleMode,
        chatParticles,
        formalKeywords,
        workIntentKeywords
      }
    };
  }

  return result;
}
