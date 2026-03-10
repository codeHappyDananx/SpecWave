import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { OrchestratorNotification } from '@specwave/contracts';
import { AppNotificationSender } from './notificationSender';

function makeNotification(channel: OrchestratorNotification['channel']): OrchestratorNotification {
  return {
    id: 'ntf-1',
    requestId: 'req-1',
    channel,
    kind: 'delivery_ready',
    title: '标题',
    body: '正文',
    status: 'pending',
    toUserId: 'u-1',
    dedupeKey: `req-1:delivery_ready:${channel}`,
    attempts: 0,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z'
  };
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) {
    const close = closers.pop();
    if (close) await close();
  }
});

describe('AppNotificationSender', () => {
  it('支持 internal，并在配置 webhook 后支持 dingtalk', async () => {
    const sender = new AppNotificationSender({
      dingtalk: { webhook: 'https://example.com/robot/send?access_token=test' }
    });
    expect(sender.hasChannel('internal')).toBe(true);
    expect(sender.hasChannel('dingtalk')).toBe(true);
    expect(sender.hasChannel('telegram')).toBe(false);

    const result = await sender.send(makeNotification('internal'));
    expect(result.ok).toBe(true);
  });

  it('可以向钉钉发送 text 消息', async () => {
    let received: { url: string; body: string } | null = null;
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received = {
        url: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok', request_id: 'mock-request-id' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        })
    );

    const port = (server.address() as AddressInfo).port;
    const sender = new AppNotificationSender({
      dingtalk: {
        webhook: `http://127.0.0.1:${port}/robot/send?access_token=test-token`,
        secret: 'test-secret'
      }
    });

    const result = await sender.send(makeNotification('dingtalk'));
    expect(result).toEqual({
      ok: true,
      externalMessageId: 'mock-request-id'
    });
    expect(received).not.toBeNull();
    expect(received!.url).toContain('/robot/send?');
    expect(received!.url).toContain('access_token=test-token');
    expect(received!.url).toContain('timestamp=');
    expect(received!.url).toContain('sign=');
    expect(JSON.parse(received!.body)).toEqual({
      msgtype: 'text',
      text: {
        content: '标题\n正文'
      }
    });
  });

  it('可以向 Telegram 发送消息', async () => {
    let received: { url: string; body: string } | null = null;
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received = {
        url: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 7788 } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        })
    );

    const port = (server.address() as AddressInfo).port;
    const sender = new AppNotificationSender({
      telegram: {
        botToken: 'test-telegram-token',
        tenantId: 'tenant-a',
        projectId: 'proj-a',
        mode: 'polling',
        requireMention: false,
        apiBaseUrl: `http://127.0.0.1:${port}`,
        pollingTimeoutSec: 20,
        pollingBackoffMs: 1000
      }
    });

    const result = await sender.send({
      ...makeNotification('telegram'),
      toUserId: 'tg-chat:-100123456'
    });
    expect(result).toEqual({
      ok: true,
      externalMessageId: '7788'
    });
    expect(received).not.toBeNull();
    expect(received!.url).toBe('/bottest-telegram-token/sendMessage');
    expect(JSON.parse(received!.body)).toEqual({
      chat_id: '-100123456',
      text: '标题\n正文'
    });
  });
});
