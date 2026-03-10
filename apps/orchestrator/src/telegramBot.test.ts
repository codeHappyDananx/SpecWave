import { describe, expect, it } from 'vitest';
import type { AgentRuntime } from './agentRuntime';
import type { OrchestratorStateSnapshot, OrchestratorStateStore } from './orchestratorService';
import { OrchestratorService } from './orchestratorService';
import { handleTelegramBotInbound } from './telegramBot';

class MemoryStore implements OrchestratorStateStore {
  snapshot: OrchestratorStateSnapshot | null = null;

  async load(): Promise<OrchestratorStateSnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: OrchestratorStateSnapshot): Promise<void> {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as OrchestratorStateSnapshot;
  }
}

function makeService() {
  const store = new MemoryStore();
  let seq = 0;
  const service = new OrchestratorService(store, {
    now: () => new Date('2026-03-04T00:00:00.000Z'),
    idFactory: () => `id-${String(++seq).padStart(4, '0')}`
  });
  return { service };
}

describe('telegramBot', () => {
  it('收到普通文本后会创建请求并返回回复文本', async () => {
    const { service } = makeService();
    await service.initialize();
    const result = await handleTelegramBotInbound(
      service,
      {
        update_id: 1001,
        message: {
          message_id: 2001,
          chat: { id: 3001, type: 'private' },
          from: { id: 4001, first_name: '张', last_name: '三' },
          text: '请帮我做一个自动交付系统'
        }
      },
      {
        tenantId: 'tenant-a',
        projectId: 'proj-a',
        requireMention: true
      }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('request');
    expect(result.requestId).toBeTruthy();
    expect(result.replyText).toContain('诉求已接收');
  });

  it('支持状态命令并在群聊下执行@规则', async () => {
    const { service } = makeService();
    await service.initialize();
    const created = await handleTelegramBotInbound(
      service,
      {
        update_id: 1002,
        message: {
          message_id: 2002,
          chat: { id: 3002, type: 'private' },
          from: { id: 4002, first_name: '李' },
          text: '我要自动开发自动测试'
        }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireMention: true,
        botUsername: 'specwave_bot'
      }
    );

    const ignored = await handleTelegramBotInbound(
      service,
      {
        update_id: 1003,
        message: {
          message_id: 2003,
          chat: { id: -1003003, type: 'group' },
          from: { id: 4003, first_name: '王' },
          text: `状态 ${created.requestId}`
        }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireMention: true,
        botUsername: 'specwave_bot'
      }
    );
    expect(ignored.handled).toBe(false);
    expect(ignored.action).toBe('ignored');

    const query = await handleTelegramBotInbound(
      service,
      {
        update_id: 1004,
        message: {
          message_id: 2004,
          chat: { id: -1003003, type: 'group' },
          from: { id: 4003, first_name: '王' },
          text: `@specwave_bot 状态 ${created.requestId}`
        }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireMention: true,
        botUsername: 'specwave_bot'
      }
    );
    expect(query.handled).toBe(true);
    expect(query.action).toBe('status');
    expect(query.replyText).toContain(created.requestId!);
  });

  it('支持 chatId 白名单控制', async () => {
    const { service } = makeService();
    await service.initialize();

    const rejected = await handleTelegramBotInbound(
      service,
      {
        update_id: 1005,
        message: {
          message_id: 2005,
          chat: { id: 99901, type: 'private' },
          from: { id: 99901, first_name: 'A' },
          text: 'hello'
        }
      },
      {
        tenantId: 'tenant-c',
        projectId: 'proj-c',
        requireMention: false,
        allowedChatIds: ['99902']
      }
    );

    expect(rejected.handled).toBe(false);
    expect(rejected.replyText).toContain('未授权');
  });

  it('启用 agentRuntime 后会直接转发 agent 回复', async () => {
    const { service } = makeService();
    await service.initialize();
    const runtime: AgentRuntime = {
      ask: async (message) => {
        expect(message.channel).toBe('telegram');
        expect(message.text).toBe('我们开始吧');
        return {
          text: '收到，我们开始按需求分析流程推进。',
          backend: 'claude',
          durationMs: 8
        };
      }
    };

    const result = await handleTelegramBotInbound(
      service,
      {
        update_id: 3001,
        message: {
          message_id: 3002,
          chat: { id: 3003, type: 'private' },
          from: { id: 3004, first_name: '赵' },
          text: '我们开始吧'
        }
      },
      {
        tenantId: 'tenant-d',
        projectId: 'proj-d',
        requireMention: false,
        agentRuntime: runtime
      }
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('按需求分析流程推进');

    const metrics = await service.getMetricsSummary();
    expect(metrics.totalRequests).toBe(0);
  });
});
