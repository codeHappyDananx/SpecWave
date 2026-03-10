import { createHmac } from 'node:crypto';
import type { OrchestratorNotification, OrchestratorNotificationChannel } from '@specwave/contracts';
import type { OrchestratorConnectorConfig } from './connectorConfig';
import type { NotificationDispatchResult, NotificationSender } from './orchestratorService';
import { sendTelegramMessage } from './telegramApi';

type DingTalkSendResult = {
  errcode?: number;
  errmsg?: string;
  request_id?: string;
};

function buildSignedDingTalkWebhook(baseWebhook: string, secret?: string): string {
  if (!secret) return baseWebhook;
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = createHmac('sha256', secret).update(stringToSign).digest('base64');
  const url = new URL(baseWebhook);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);
  return url.toString();
}

export class AppNotificationSender implements NotificationSender {
  constructor(private readonly config: OrchestratorConnectorConfig) {}

  hasChannel(channel: OrchestratorNotificationChannel): boolean {
    if (channel === 'internal') return true;
    if (channel === 'dingtalk') return Boolean(this.config.dingtalk?.webhook);
    if (channel === 'telegram') return Boolean(this.config.telegram?.botToken);
    return false;
  }

  async send(notification: OrchestratorNotification): Promise<NotificationDispatchResult> {
    if (notification.channel === 'internal') return { ok: true };
    if (notification.channel === 'dingtalk') return this.sendToDingTalk(notification);
    if (notification.channel === 'telegram') return this.sendToTelegram(notification);
    return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
  }

  private async sendToDingTalk(notification: OrchestratorNotification): Promise<NotificationDispatchResult> {
    const webhook = this.config.dingtalk?.webhook;
    if (!webhook) {
      return { ok: false, error: 'DINGTALK_NOT_CONFIGURED' };
    }

    const url = buildSignedDingTalkWebhook(webhook, this.config.dingtalk?.secret);
    const keyword = this.config.dingtalk?.keyword?.trim();
    const content = keyword
      ? `${keyword}\n${notification.title}\n${notification.body}`
      : `${notification.title}\n${notification.body}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content }
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `DINGTALK_NETWORK_ERROR:${message}` };
    }

    let parsed: DingTalkSendResult | null = null;
    const rawBody = await response.text();
    if (rawBody.trim().length > 0) {
      try {
        parsed = JSON.parse(rawBody) as DingTalkSendResult;
      } catch {
        if (!response.ok) {
          return { ok: false, error: `DINGTALK_HTTP_${response.status}:${rawBody.slice(0, 120)}` };
        }
        return { ok: false, error: `DINGTALK_INVALID_RESPONSE:${rawBody.slice(0, 120)}` };
      }
    }

    if (!response.ok) {
      const tail = parsed?.errmsg ?? rawBody.slice(0, 120);
      return { ok: false, error: `DINGTALK_HTTP_${response.status}:${tail}` };
    }

    if (parsed?.errcode === 0) {
      return { ok: true, externalMessageId: parsed.request_id };
    }

    const errCode = parsed?.errcode ?? 'unknown';
    const errMsg = parsed?.errmsg ?? 'unknown error';
    return { ok: false, error: `DINGTALK_ERR_${errCode}:${errMsg}` };
  }

  private parseTelegramChatId(raw: string): string | undefined {
    const value = raw.trim();
    if (!value) return undefined;
    const match = value.match(/^(?:tg-chat:|tg-user:|tg:)(.+)$/i);
    if (match?.[1]) return match[1].trim();
    if (/^-?\d+$/.test(value)) return value;
    return undefined;
  }

  private async sendToTelegram(notification: OrchestratorNotification): Promise<NotificationDispatchResult> {
    const telegram = this.config.telegram;
    if (!telegram) {
      return { ok: false, error: 'TELEGRAM_NOT_CONFIGURED' };
    }

    const chatId = this.parseTelegramChatId(notification.toUserId);
    if (!chatId) {
      return { ok: false, error: `TELEGRAM_INVALID_CHAT_ID:${notification.toUserId}` };
    }

    const text = `${notification.title}\n${notification.body}`;
    const result = await sendTelegramMessage(
      {
        apiBaseUrl: telegram.apiBaseUrl,
        botToken: telegram.botToken
      },
      {
        chatId,
        text
      }
    );
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      externalMessageId: result.messageId
    };
  }
}
