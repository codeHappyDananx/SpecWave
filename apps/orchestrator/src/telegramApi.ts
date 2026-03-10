export type TelegramApiConfig = {
  apiBaseUrl: string;
  botToken: string;
};

export type TelegramUser = {
  id: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number | string;
  type?: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

function buildTelegramApiUrl(config: TelegramApiConfig, method: string): string {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  return `${base}/bot${config.botToken}/${method}`;
}

async function callTelegramApi<T>(
  config: TelegramApiConfig,
  method: string,
  payload: Record<string, unknown>,
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  let signal = options?.signal;
  if (!signal && options?.timeoutMs && options.timeoutMs > 0) {
    signal = AbortSignal.timeout(options.timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(buildTelegramApiUrl(config, method), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `TELEGRAM_NETWORK_ERROR:${message}` };
  }

  const raw = await response.text();
  let parsed: TelegramApiResponse<T> | null = null;
  if (raw.trim().length > 0) {
    try {
      parsed = JSON.parse(raw) as TelegramApiResponse<T>;
    } catch {
      if (!response.ok) {
        return { ok: false, error: `TELEGRAM_HTTP_${response.status}:${raw.slice(0, 160)}` };
      }
      return { ok: false, error: `TELEGRAM_INVALID_RESPONSE:${raw.slice(0, 160)}` };
    }
  }

  if (!response.ok) {
    const tail = parsed?.description ?? raw.slice(0, 160);
    return { ok: false, error: `TELEGRAM_HTTP_${response.status}:${tail}` };
  }

  if (!parsed) {
    return { ok: false, error: 'TELEGRAM_EMPTY_RESPONSE' };
  }
  if (!parsed.ok) {
    const code = parsed.error_code ?? 'unknown';
    return { ok: false, error: `TELEGRAM_ERR_${code}:${parsed.description ?? 'unknown error'}` };
  }
  return { ok: true, result: parsed.result as T };
}

export async function sendTelegramMessage(
  config: TelegramApiConfig,
  input: {
    chatId: string;
    text: string;
    replyToMessageId?: number;
  }
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text
  };
  if (input.replyToMessageId) {
    payload.reply_to_message_id = input.replyToMessageId;
  }

  const result = await callTelegramApi<{ message_id?: number }>(config, 'sendMessage', payload, {
    timeoutMs: 10000
  });
  if (!result.ok) return result;
  return {
    ok: true,
    messageId: typeof result.result?.message_id === 'number' ? String(result.result.message_id) : undefined
  };
}

function normalizeUpdateList(payload: unknown): TelegramUpdate[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is TelegramUpdate => {
    if (!item || typeof item !== 'object') return false;
    const update = item as Record<string, unknown>;
    return typeof update.update_id === 'number';
  });
}

export async function getTelegramUpdates(
  config: TelegramApiConfig,
  input: {
    offset?: number;
    timeoutSec: number;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<{ ok: true; updates: TelegramUpdate[] } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = {
    timeout: input.timeoutSec,
    allowed_updates: ['message']
  };
  if (typeof input.offset === 'number') payload.offset = input.offset;
  if (typeof input.limit === 'number') payload.limit = input.limit;

  const result = await callTelegramApi<unknown>(config, 'getUpdates', payload, {
    signal: input.signal
  });
  if (!result.ok) return result;
  return {
    ok: true,
    updates: normalizeUpdateList(result.result)
  };
}
