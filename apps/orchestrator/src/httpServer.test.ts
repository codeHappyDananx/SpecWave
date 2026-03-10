import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { AssistantService } from './assistantService';
import type { AssistantStateSnapshot } from './assistantStateStore';
import { startHttpServer } from './httpServer';
import { OrchestratorService, type OrchestratorStateSnapshot, type OrchestratorStateStore } from './orchestratorService';

class MemoryStore implements OrchestratorStateStore {
  snapshot: OrchestratorStateSnapshot | null = null;
  async load() {
    return this.snapshot;
  }
  async save(snapshot: OrchestratorStateSnapshot) {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as OrchestratorStateSnapshot;
  }
}

class MemoryAssistantStore {
  snapshot: AssistantStateSnapshot | null = null;
  async load() {
    return this.snapshot;
  }
  async save(snapshot: AssistantStateSnapshot) {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as AssistantStateSnapshot;
  }
}

describe('httpServer', () => {
  it('可通过 webhook 创建请求并返回结果详情', async () => {
    const store = new MemoryStore();
    let now = new Date('2026-03-01T00:00:00.000Z');
    const service = new OrchestratorService(store, {
      now: () => new Date(now.getTime()),
      idFactory: (() => {
        let seq = 0;
        return () => `http-${++seq}`;
      })()
    });
    await service.initialize();
    const running = await startHttpServer(service, { host: '127.0.0.1', port: 0 });
    const port = running.address?.port;
    if (!port) throw new Error('server port unavailable');
    const base = `http://127.0.0.1:${port}`;

    try {
      const createRes = await fetch(`${base}/api/v1/channels/webchat/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: 'chat-http-1',
          user: { id: 'u-http-1', name: '测试用户' },
          text: '请自动交付最终结果',
          tenantId: 'tenant-http',
          projectId: 'proj-http',
          idempotencyKey: 'idem-http-1'
        })
      });
      expect(createRes.status).toBe(200);
      const createJson = (await createRes.json()) as { ok: boolean; data: { requestId: string } };
      expect(createJson.ok).toBe(true);

      now = new Date('2026-03-02T01:00:00.000Z');
      const tickRes = await fetch(`${base}/api/v1/system/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(tickRes.status).toBe(200);

      const detailRes = await fetch(`${base}/api/v1/requests/${createJson.data.requestId}`);
      expect(detailRes.status).toBe(200);
      const detailJson = (await detailRes.json()) as {
        ok: boolean;
        data: { request: { state: string }; notifications: Array<{ kind: string }> };
      };
      expect(detailJson.ok).toBe(true);
      expect(detailJson.data.request.state).toBe('REMINDER_L1');
      expect(detailJson.data.notifications.some((item) => item.kind === 'delivery_ready')).toBe(true);

      const metricsRes = await fetch(`${base}/api/v1/metrics/summary`);
      expect(metricsRes.status).toBe(200);
      const metrics = (await metricsRes.json()) as { ok: boolean; data: { totalRequests: number } };
      expect(metrics.ok).toBe(true);
      expect(metrics.data.totalRequests).toBeGreaterThanOrEqual(1);
    } finally {
      await running.close();
    }
  });

  it('支持钉钉应用机器人入站并回发 sessionWebhook', async () => {
    const store = new MemoryStore();
    const service = new OrchestratorService(store, {
      now: () => new Date('2026-03-01T00:00:00.000Z'),
      idFactory: (() => {
        let seq = 0;
        return () => `dt-${++seq}`;
      })()
    });
    await service.initialize();

    let sessionPayload = '';
    const sessionServer = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      sessionPayload = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
    });
    await new Promise<void>((resolve) => sessionServer.listen(0, '127.0.0.1', resolve));
    const sessionPort = (sessionServer.address() as AddressInfo).port;

    const running = await startHttpServer(service, {
      host: '127.0.0.1',
      port: 0,
      dingtalkAppbot: {
        tenantId: 'tenant-dt',
        projectId: 'proj-dt',
        requireAt: true
      }
    });
    const port = running.address?.port;
    if (!port) throw new Error('server port unavailable');
    const base = `http://127.0.0.1:${port}`;

    try {
      const inboundRes = await fetch(`${base}/api/v1/channels/dingtalk/appbot/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'cid-http-1',
          msgId: 'mid-http-1',
          conversationType: '1',
          isInAtList: true,
          senderStaffId: 'staff-http-1',
          senderNick: '测试用户',
          sessionWebhook: `http://127.0.0.1:${sessionPort}/robot/sendBySession?session=abc`,
          text: { content: '请帮我进入自动交付流程' }
        })
      });
      expect(inboundRes.status).toBe(200);
      const inbound = (await inboundRes.json()) as {
        ok: boolean;
        data: { action: string; requestId?: string; replyDelivered: boolean };
      };
      expect(inbound.ok).toBe(true);
      expect(inbound.data.action).toBe('request');
      expect(inbound.data.requestId).toBeTruthy();
      expect(inbound.data.replyDelivered).toBe(true);
      expect(sessionPayload).toContain('"msgtype":"text"');
      expect(sessionPayload).toContain('诉求已接收');
    } finally {
      await running.close();
      await new Promise<void>((resolve, reject) => {
        sessionServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  it('支持 Telegram webhook 入站并回发消息', async () => {
    const store = new MemoryStore();
    const service = new OrchestratorService(store, {
      now: () => new Date('2026-03-01T00:00:00.000Z'),
      idFactory: (() => {
        let seq = 0;
        return () => `tg-${++seq}`;
      })()
    });
    await service.initialize();

    let telegramPayload = '';
    const telegramApiServer = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      telegramPayload = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 7788 } }));
    });
    await new Promise<void>((resolve) => telegramApiServer.listen(0, '127.0.0.1', resolve));
    const telegramApiPort = (telegramApiServer.address() as AddressInfo).port;

    const running = await startHttpServer(service, {
      host: '127.0.0.1',
      port: 0,
      telegram: {
        botToken: 'telegram-token',
        tenantId: 'tenant-tg',
        projectId: 'proj-tg',
        mode: 'webhook',
        requireMention: false,
        webhookSecretToken: 'secret-token',
        apiBaseUrl: `http://127.0.0.1:${telegramApiPort}`,
        pollingTimeoutSec: 20,
        pollingBackoffMs: 1000
      }
    });
    const port = running.address?.port;
    if (!port) throw new Error('server port unavailable');
    const base = `http://127.0.0.1:${port}`;

    try {
      const inboundRes = await fetch(`${base}/api/v1/channels/telegram/bot/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'secret-token'
        },
        body: JSON.stringify({
          update_id: 9001,
          message: {
            message_id: 9002,
            chat: { id: 9003, type: 'private' },
            from: { id: 9004, first_name: '测试' },
            text: '请帮我进入自动交付流程'
          }
        })
      });
      expect(inboundRes.status).toBe(200);
      const inbound = (await inboundRes.json()) as {
        ok: boolean;
        data: { action: string; requestId?: string; replyDelivered: boolean };
      };
      expect(inbound.ok).toBe(true);
      expect(inbound.data.action).toBe('request');
      expect(inbound.data.requestId).toBeTruthy();
      expect(inbound.data.replyDelivered).toBe(true);
      expect(telegramPayload).toContain('"chat_id":"9003"');
      expect(telegramPayload).toContain('诉求已接收');
    } finally {
      await running.close();
      await new Promise<void>((resolve, reject) => {
        telegramApiServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  it('支持 assistant onboarding、chat、审批与证据查询接口', async () => {
    const store = new MemoryStore();
    const assistantStore = new MemoryAssistantStore();
    const service = new OrchestratorService(store, {
      now: () => new Date('2026-03-01T00:00:00.000Z'),
      idFactory: (() => {
        let seq = 0;
        return () => `assistant-http-${++seq}`;
      })()
    });
    await service.initialize();
    const assistantService = new AssistantService(assistantStore, {
      now: () => new Date('2026-03-01T00:00:00.000Z'),
      idFactory: (() => {
        let seq = 0;
        return () => `assistant-core-${++seq}`;
      })()
    });
    await assistantService.initialize();

    const running = await startHttpServer(service, {
      host: '127.0.0.1',
      port: 0,
      assistantService
    });
    const port = running.address?.port;
    if (!port) throw new Error('server port unavailable');
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-specwave-user-id': 'assistant-user-1',
      'x-specwave-user-name': 'assistant-test-user'
    };

    try {
      const startRes = await fetch(`${base}/api/v1/onboarding/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      expect(startRes.status).toBe(200);

      await fetch(`${base}/api/v1/onboarding/continue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: '我是开发负责人，主要推进需求和代码交付。' })
      });
      await fetch(`${base}/api/v1/onboarding/continue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: '我经常写方案、改代码、跑测试。' })
      });
      await fetch(`${base}/api/v1/onboarding/continue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: 'VS Code, Git, pnpm, 本地仓库' })
      });
      const confirmRes = await fetch(`${base}/api/v1/onboarding/continue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: '改代码和跑测试可以自动，发消息必须先确认。' })
      });
      const confirmJson = (await confirmRes.json()) as { ok: boolean; data: { session: { status: string } } };
      expect(confirmJson.data.session.status).toBe('awaiting_confirmation');

      const finishRes = await fetch(`${base}/api/v1/onboarding/finish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmed: true })
      });
      expect(finishRes.status).toBe(200);

      const profileRes = await fetch(`${base}/api/v1/profile/me`, { headers });
      const profileJson = (await profileRes.json()) as { ok: boolean; data: { displayName: string } };
      expect(profileJson.data.displayName).toBe('assistant-test-user');

      const riskRes = await fetch(`${base}/api/v1/sessions/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: 'assistant-session-1', message: '给客户发送邮件，说今天已经交付完成。' })
      });
      const riskJson = (await riskRes.json()) as { ok: boolean; data: { pendingApproval?: { status: string } } };
      expect(riskJson.data.pendingApproval?.status).toBe('pending');

      const approveRes = await fetch(`${base}/api/v1/sessions/assistant-session-1/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'approve' })
      });
      const approveJson = (await approveRes.json()) as { ok: boolean; data: { checkpoint: { status: string } } };
      expect(approveJson.data.checkpoint.status).toBe('approved');

      const evidenceRes = await fetch(`${base}/api/v1/sessions/assistant-session-1/evidence`, { headers });
      const evidenceJson = (await evidenceRes.json()) as { ok: boolean; data: Array<{ kind: string }> };
      expect(evidenceJson.data.some((item) => item.kind === 'approval_requested')).toBe(true);
      expect(evidenceJson.data.some((item) => item.kind === 'approval_resolved')).toBe(true);
    } finally {
      await running.close();
    }
  });
});
