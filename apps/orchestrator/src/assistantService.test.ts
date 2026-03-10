import { describe, expect, it } from 'vitest';
import type { AgentRuntime } from './agentRuntime';
import { AssistantService } from './assistantService';
import type { AssistantStateSnapshot } from './assistantStateStore';

class MemoryAssistantStore {
  snapshot: AssistantStateSnapshot | null = null;

  async load() {
    return this.snapshot;
  }

  async save(snapshot: AssistantStateSnapshot) {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as AssistantStateSnapshot;
  }
}

const stubRuntime: AgentRuntime = {
  async ask(message) {
    return {
      text: `已处理：${message.text}`,
      backend: 'command',
      durationMs: 1
    };
  }
};

function createAssistantService() {
  const store = new MemoryAssistantStore();
  let seq = 0;
  const service = new AssistantService(store, {
    now: () => new Date('2026-03-01T00:00:00.000Z'),
    idFactory: () => `assistant-${++seq}`,
    agentRuntime: stubRuntime
  });
  return { service, store };
}

describe('AssistantService', () => {
  it('可以完成初始化访谈并写入用户画像', async () => {
    const { service } = createAssistantService();
    await service.initialize();

    const started = await service.startOnboarding({ userId: 'u1', userName: '黄雨瑶' });
    expect(started.session.currentStep).toBe('role');

    await service.continueOnboarding({ userId: 'u1', message: '我是金融分析师，也会做一些数据自动化。' });
    await service.continueOnboarding({ userId: 'u1', message: '我经常做日报、周报、研究摘要。' });
    await service.continueOnboarding({ userId: 'u1', message: 'Excel, CSV, Python, 投研数据库' });
    const confirm = await service.continueOnboarding({ userId: 'u1', message: '报表和分析可以自动做，外发消息必须先确认。' });

    expect(confirm.session.status).toBe('awaiting_confirmation');
    expect(confirm.session.recommendedCapabilityPackIds).toContain('finance-analysis');

    const finished = await service.finishOnboarding({ userId: 'u1', confirmed: true });
    expect(finished.profile?.displayName).toBe('黄雨瑶');
    expect(finished.profile?.enabledCapabilityPackIds).toContain('finance-analysis');
    expect(service.getProfile('u1')?.approvalPolicy.autoApproveUpTo).toBe('R1');
  });

  it('未初始化画像时，chat 会要求先 onboarding', async () => {
    const { service } = createAssistantService();
    await service.initialize();

    const output = await service.chat({
      userId: 'u2',
      userName: '未初始化用户',
      sessionId: 'session-u2',
      channel: 'desktop',
      tenantId: 'local',
      projectId: 'local',
      message: '帮我整理今天的任务'
    });

    expect(output.onboardingRequired).toBe(true);
    expect(output.reply).toContain('你还没完成初始化');
  });

  it('高风险请求会进入审批，批准后返回执行回复并保留证据', async () => {
    const { service } = createAssistantService();
    await service.initialize();
    await service.upsertProfile(
      'u3',
      {
        displayName: '测试用户',
        enabledCapabilityPackIds: ['general-office', 'desktop-execution']
      },
      '测试用户'
    );

    const chat = await service.chat({
      userId: 'u3',
      userName: '测试用户',
      sessionId: 'session-u3',
      channel: 'desktop',
      tenantId: 'local',
      projectId: 'local',
      message: '给客户发送邮件，告诉他今天的方案已经完成。'
    });

    expect(chat.pendingApproval?.status).toBe('pending');
    expect(chat.intent.riskLevel).toBe('R3');

    const approval = await service.approveSession('session-u3', {
      action: 'approve',
      actorId: 'u3',
      actorName: '测试用户'
    });

    expect(approval.checkpoint.status).toBe('approved');
    expect(approval.reply).toContain('已处理：用户已明确批准执行');
    expect(service.getSessionEvidence('session-u3').length).toBeGreaterThanOrEqual(4);
  });
});
