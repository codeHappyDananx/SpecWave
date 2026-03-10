import { createHmac } from 'node:crypto';
import type { OrchestratorConnectorConfig, ProactiveGreetingConfig } from './connectorConfig';

type RunningProactiveGreeting = {
  close: () => void;
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

function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(list: readonly T[]): T {
  return list[randomBetween(0, list.length - 1)]!;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isInQuietHours(now: Date, quietHours: ProactiveGreetingConfig['quietHours']): boolean {
  if (!quietHours) return false;
  const hour = now.getHours();
  const start = quietHours.startHour;
  const end = quietHours.endHour;
  if (start === end) return false;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

async function sendDingtalkGreeting(config: OrchestratorConnectorConfig, text: string): Promise<void> {
  const webhook = config.dingtalk?.webhook;
  if (!webhook) throw new Error('dingtalk webhook 未配置，无法发送主动问候。');
  const url = buildSignedDingTalkWebhook(webhook, config.dingtalk?.secret);
  const keyword = config.dingtalk?.keyword?.trim();
  const content = keyword ? `${keyword}\n${text}` : text;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      msgtype: 'text',
      text: {
        content
      }
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${raw.slice(0, 120)}`.trim());
  }
  const body = (await response.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    throw new Error(`errcode=${body.errcode} ${body.errmsg ?? ''}`.trim());
  }
}

export function startProactiveGreeting(
  connectorConfig: OrchestratorConnectorConfig
): RunningProactiveGreeting | null {
  const config = connectorConfig.proactiveGreeting;
  if (!config?.enabled) return null;
  if (!config.templates || config.templates.length === 0) {
    console.warn('[orchestrator] proactive greeting enabled but templates empty, skipped.');
    return null;
  }

  let closed = false;
  let sentToday = 0;
  let sentDayKey = dayKey(new Date());

  const scheduleNextAt = (from: Date): number => {
    const minutes = randomBetween(config.minIntervalMinutes, config.maxIntervalMinutes);
    return from.getTime() + minutes * 60 * 1000;
  };

  let nextAt = scheduleNextAt(new Date());

  const tick = async () => {
    if (closed) return;
    const now = new Date();
    const today = dayKey(now);
    if (today !== sentDayKey) {
      sentDayKey = today;
      sentToday = 0;
    }

    if (sentToday >= config.dailyMax) return;
    if (now.getTime() < nextAt) return;

    if (isInQuietHours(now, config.quietHours)) {
      nextAt = now.getTime() + Math.max(config.checkIntervalSeconds, 10) * 1000;
      return;
    }

    const text = pickRandom(config.templates);
    try {
      await sendDingtalkGreeting(connectorConfig, text);
      sentToday += 1;
      console.log(`[orchestrator] proactive greeting sent (${sentToday}/${config.dailyMax}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] proactive greeting failed: ${message}`);
    } finally {
      nextAt = scheduleNextAt(new Date());
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(config.checkIntervalSeconds, 5) * 1000);
  timer.unref();

  console.log(
    `[orchestrator] proactive greeting enabled interval=${config.minIntervalMinutes}-${config.maxIntervalMinutes}m dailyMax=${config.dailyMax}`
  );

  return {
    close: () => {
      closed = true;
      clearInterval(timer);
    }
  };
}
