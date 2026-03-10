import { describe, expect, it } from 'vitest';
import { OrchestratorService, type OrchestratorStateSnapshot, type OrchestratorStateStore } from './orchestratorService';

class MemoryStore implements OrchestratorStateStore {
  snapshot: OrchestratorStateSnapshot | null = null;

  async load(): Promise<OrchestratorStateSnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: OrchestratorStateSnapshot): Promise<void> {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as OrchestratorStateSnapshot;
  }
}

function makeServiceWithClock(startIso = '2026-03-01T00:00:00.000Z') {
  const store = new MemoryStore();
  let now = new Date(startIso);
  let seq = 0;
  const service = new OrchestratorService(store, {
    now: () => new Date(now.getTime()),
    idFactory: () => `id-${String(++seq).padStart(4, '0')}`
  });
  return {
    service,
    store,
    setNow: (iso: string) => {
      now = new Date(iso);
    }
  };
}

describe('OrchestratorService', () => {
  it('低风险请求会自动推进到待验收并生成结果包', async () => {
    const { service } = makeServiceWithClock();
    await service.initialize();

    const created = await service.createRequest({
      tenantId: 'tenant-a',
      projectId: 'proj-auto',
      sourceChannel: 'webchat',
      requesterId: 'u-1',
      intent: '我要一个自动交付闭环',
      idempotencyKey: 'idem-001',
      riskLevel: 'R1'
    });

    const detail = await service.getRequestDetail(created.requestId);
    expect(detail.request.state).toBe('ACCEPTANCE_PENDING');
    expect(detail.delivery?.resultCard.title).toContain('业务验收卡');
    expect(detail.pendingApprovals.length).toBe(0);
    expect(detail.notifications.some((item) => item.kind === 'delivery_ready' && item.status === 'sent')).toBe(true);
  });

  it('高风险请求会卡在审批，审批通过后继续执行', async () => {
    const { service } = makeServiceWithClock();
    await service.initialize();

    const created = await service.createRequest({
      tenantId: 'tenant-a',
      projectId: 'proj-risk',
      sourceChannel: 'webchat',
      requesterId: 'u-2',
      intent: '执行高风险改动',
      idempotencyKey: 'idem-002',
      riskLevel: 'R3'
    });

    const waiting = await service.getRequestDetail(created.requestId);
    expect(waiting.request.state).toBe('WAITING_APPROVAL');
    expect(waiting.pendingApprovals.length).toBe(1);

    const afterApproval = await service.submitApproval({
      approvalId: waiting.pendingApprovals[0]!.id,
      decision: 'approved',
      actorId: 'op-1'
    });
    expect(afterApproval.request.state).toBe('ACCEPTANCE_PENDING');
  });

  it('验收超时会进入提醒、升级并最终暂停', async () => {
    const { service, setNow } = makeServiceWithClock();
    await service.initialize();

    const created = await service.createRequest({
      tenantId: 'tenant-a',
      projectId: 'proj-timeout',
      sourceChannel: 'webchat',
      requesterId: 'u-3',
      intent: '我要一个结果导向工作流',
      idempotencyKey: 'idem-003'
    });

    setNow('2026-03-02T01:00:00.000Z');
    await service.tick();
    let detail = await service.getRequestDetail(created.requestId);
    expect(detail.request.state).toBe('REMINDER_L1');

    setNow('2026-03-03T01:00:00.000Z');
    await service.tick();
    detail = await service.getRequestDetail(created.requestId);
    expect(detail.request.state).toBe('REMINDER_L2');

    setNow('2026-03-04T01:00:00.000Z');
    await service.tick();
    detail = await service.getRequestDetail(created.requestId);
    expect(detail.request.state).toBe('ESCALATION_L3');

    setNow('2026-03-05T02:00:00.000Z');
    await service.tick();
    detail = await service.getRequestDetail(created.requestId);
    expect(detail.request.state).toBe('PAUSED_BY_NO_RESPONSE');
    expect(detail.runs.some((run) => run.stage === 'orchestration' && run.state === 'paused')).toBe(true);
    expect(detail.notifications.some((item) => item.kind === 'acceptance_escalated')).toBe(true);
    expect(detail.notifications.some((item) => item.kind === 'paused_no_response')).toBe(true);
  });

  it('暂停运行可恢复并回到待验收', async () => {
    const { service, setNow } = makeServiceWithClock();
    await service.initialize();

    const created = await service.createRequest({
      tenantId: 'tenant-a',
      projectId: 'proj-resume',
      sourceChannel: 'webchat',
      requesterId: 'u-4',
      intent: '恢复场景测试',
      idempotencyKey: 'idem-004'
    });

    setNow('2026-03-05T02:00:00.000Z');
    await service.tick(new Date('2026-03-05T02:00:00.000Z'));
    await service.tick(new Date('2026-03-06T02:00:00.000Z'));
    await service.tick(new Date('2026-03-07T02:00:00.000Z'));
    await service.tick(new Date('2026-03-08T03:00:00.000Z'));

    const paused = await service.getRequestDetail(created.requestId);
    const pausedRun = paused.runs.find((run) => run.stage === 'orchestration' && run.state === 'paused');
    expect(pausedRun).toBeTruthy();

    const resumed = await service.resumeRun(pausedRun!.id, {
      actorId: 'op-2',
      reason: '客户已回到会话，继续验收'
    });
    expect(resumed.request.state).toBe('ACCEPTANCE_PENDING');
  });

  it('提供通知列表、确认通知与指标摘要', async () => {
    const { service, setNow } = makeServiceWithClock();
    await service.initialize();

    const created = await service.createRequest({
      tenantId: 'tenant-a',
      projectId: 'proj-metrics',
      sourceChannel: 'webchat',
      requesterId: 'u-5',
      intent: '指标与通知测试',
      idempotencyKey: 'idem-005'
    });

    setNow('2026-03-02T02:00:00.000Z');
    await service.tick();

    const notifications = await service.listNotifications({ requestId: created.requestId });
    expect(notifications.length).toBeGreaterThan(0);
    const first = notifications[0]!;
    const acked = await service.ackNotification(first.id, 'client-u5');
    expect(acked.status).toBe('acked');

    const metrics = await service.getMetricsSummary();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(1);
    expect(metrics.acceptancePendingCount).toBeGreaterThanOrEqual(1);
  });
});
