import { randomUUID } from 'node:crypto';
import type {
  OrchestratorAcceptanceInput,
  OrchestratorApproval,
  OrchestratorApprovalDecision,
  OrchestratorApprovalInput,
  OrchestratorCreateRequestInput,
  OrchestratorCreateRequestOutput,
  OrchestratorDelivery,
  OrchestratorDemoLinkOutput,
  OrchestratorEvent,
  OrchestratorMetricsSummary,
  OrchestratorNotification,
  OrchestratorNotificationChannel,
  OrchestratorNotificationKind,
  OrchestratorPlan,
  OrchestratorProject,
  OrchestratorRequest,
  OrchestratorRequestDetail,
  OrchestratorRequestState,
  OrchestratorResultCardOutput,
  OrchestratorRiskLevel,
  OrchestratorRun,
  OrchestratorRunResumeInput,
  OrchestratorSpec,
  OrchestratorTask,
  OrchestratorTestReport,
  OrchestratorWebhookPayload
} from '@specwave/contracts';

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEMO_LINK_HOURS = 24 * 7;

function toIso(d: Date): string {
  return new Date(d.getTime()).toISOString();
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * ONE_HOUR_MS);
}

function slugFromIntent(intent: string): string {
  const clean = intent
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .toLowerCase();
  if (clean.length > 32) return clean.slice(0, 32);
  return clean || 'request';
}

export type OrchestratorStateSnapshot = {
  projects: Record<string, OrchestratorProject>;
  requests: Record<string, OrchestratorRequest>;
  specs: Record<string, OrchestratorSpec>;
  plans: Record<string, OrchestratorPlan>;
  tasks: Record<string, OrchestratorTask>;
  approvals: Record<string, OrchestratorApproval>;
  notifications: Record<string, OrchestratorNotification>;
  runs: Record<string, OrchestratorRun>;
  testReports: Record<string, OrchestratorTestReport>;
  deliveries: Record<string, OrchestratorDelivery>;
  eventsByRequestId: Record<string, OrchestratorEvent[]>;
  idempotencyToRequestId: Record<string, string>;
};

export type OrchestratorTickSummary = {
  scannedRequests: number;
  transitionedRequests: number;
  remindersSent: number;
  escalations: number;
  pausedByNoResponse: number;
};

export interface OrchestratorStateStore {
  load(): Promise<OrchestratorStateSnapshot | null>;
  save(snapshot: OrchestratorStateSnapshot): Promise<void>;
}

export type OrchestratorServiceOptions = {
  now?: () => Date;
  idFactory?: () => string;
  approvalRequiredRiskLevels?: OrchestratorRiskLevel[];
  notificationSender?: NotificationSender;
  defaultAcceptanceWindow?: {
    l1Hours: number;
    l2Hours: number;
    l3Hours: number;
    pauseAfterEscalationHours: number;
  };
};

export type NotificationDispatchResult =
  | { ok: true; externalMessageId?: string }
  | { ok: false; error: string };

export interface NotificationSender {
  hasChannel(channel: OrchestratorNotificationChannel): boolean;
  send(notification: OrchestratorNotification): Promise<NotificationDispatchResult>;
}

type EventMeta = Record<string, string | number | boolean | null>;

const DEFAULT_ACCEPTANCE_WINDOW = {
  l1Hours: 24,
  l2Hours: 48,
  l3Hours: 72,
  pauseAfterEscalationHours: 24
};

const DEFAULT_APPROVAL_REQUIRED_RISK_LEVELS: OrchestratorRiskLevel[] = ['R3'];

class InternalOnlyNotificationSender implements NotificationSender {
  hasChannel(channel: OrchestratorNotificationChannel): boolean {
    return channel === 'internal';
  }

  async send(_notification: OrchestratorNotification): Promise<NotificationDispatchResult> {
    return { ok: true };
  }
}

function emptySnapshot(): OrchestratorStateSnapshot {
  return {
    projects: {},
    requests: {},
    specs: {},
    plans: {},
    tasks: {},
    approvals: {},
    notifications: {},
    runs: {},
    testReports: {},
    deliveries: {},
    eventsByRequestId: {},
    idempotencyToRequestId: {}
  };
}

function normalizeSnapshot(raw: OrchestratorStateSnapshot | null): OrchestratorStateSnapshot {
  if (!raw) return emptySnapshot();
  return {
    projects: raw.projects ?? {},
    requests: raw.requests ?? {},
    specs: raw.specs ?? {},
    plans: raw.plans ?? {},
    tasks: raw.tasks ?? {},
    approvals: raw.approvals ?? {},
    notifications: raw.notifications ?? {},
    runs: raw.runs ?? {},
    testReports: raw.testReports ?? {},
    deliveries: raw.deliveries ?? {},
    eventsByRequestId: raw.eventsByRequestId ?? {},
    idempotencyToRequestId: raw.idempotencyToRequestId ?? {}
  };
}

const SYSTEM_ACTOR = {
  type: 'system',
  id: 'specwave-orchestrator',
  displayName: 'SpecWave Orchestrator'
} as const;

export class OrchestratorServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'OrchestratorServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class OrchestratorService {
  private snapshot: OrchestratorStateSnapshot = emptySnapshot();
  private initialized = false;
  private readonly nowFn: () => Date;
  private readonly idFactory: () => string;
  private readonly approvalRequiredRiskLevels: Set<OrchestratorRiskLevel>;
  private readonly notificationSender: NotificationSender;
  private readonly notificationChannels: OrchestratorNotificationChannel[];
  private readonly acceptanceWindow: OrchestratorServiceOptions['defaultAcceptanceWindow'];

  constructor(
    private readonly store: OrchestratorStateStore,
    options: OrchestratorServiceOptions = {}
  ) {
    this.nowFn = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.approvalRequiredRiskLevels = new Set(
      (options.approvalRequiredRiskLevels ?? DEFAULT_APPROVAL_REQUIRED_RISK_LEVELS).slice()
    );
    this.notificationSender = options.notificationSender ?? new InternalOnlyNotificationSender();
    this.notificationChannels = ['internal'];
    for (const channel of ['dingtalk', 'wecom', 'telegram', 'webchat', 'email'] as const) {
      if (this.notificationSender.hasChannel(channel)) this.notificationChannels.push(channel);
    }
    this.acceptanceWindow = options.defaultAcceptanceWindow ?? DEFAULT_ACCEPTANCE_WINDOW;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.snapshot = normalizeSnapshot(await this.store.load());
    this.initialized = true;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new OrchestratorServiceError(500, 'NOT_INITIALIZED', '服务尚未初始化。');
    }
  }

  private now(): Date {
    return new Date(this.nowFn().getTime());
  }

  private makeId(prefix: string): string {
    return `${prefix}_${this.idFactory().replace(/-/g, '')}`;
  }

  private async persist(): Promise<void> {
    await this.store.save(this.snapshot);
  }

  private ensureProject(tenantId: string, projectId: string): OrchestratorProject {
    const existing = this.snapshot.projects[projectId];
    const nowIso = toIso(this.now());
    if (existing) return existing;

    const project: OrchestratorProject = {
      id: projectId,
      tenantId,
      name: projectId,
      owner: 'system',
      repoRef: null,
      policyProfile: 'private-default',
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.snapshot.projects[projectId] = project;
    return project;
  }

  private ensureRequest(requestId: string): OrchestratorRequest {
    const request = this.snapshot.requests[requestId];
    if (!request) {
      throw new OrchestratorServiceError(404, 'REQUEST_NOT_FOUND', `未找到请求：${requestId}`);
    }
    return request;
  }

  private ensureApproval(approvalId: string): OrchestratorApproval {
    const approval = this.snapshot.approvals[approvalId];
    if (!approval) {
      throw new OrchestratorServiceError(404, 'APPROVAL_NOT_FOUND', `未找到审批单：${approvalId}`);
    }
    return approval;
  }

  private ensureRun(runId: string): OrchestratorRun {
    const run = this.snapshot.runs[runId];
    if (!run) {
      throw new OrchestratorServiceError(404, 'RUN_NOT_FOUND', `未找到运行记录：${runId}`);
    }
    return run;
  }

  private recordEvent(
    requestId: string,
    type: OrchestratorEvent['type'],
    summary: string,
    meta?: EventMeta,
    actor: OrchestratorEvent['actor'] = SYSTEM_ACTOR
  ) {
    const event: OrchestratorEvent = {
      id: this.makeId('evt'),
      requestId,
      type,
      at: toIso(this.now()),
      summary,
      actor,
      meta
    };
    const events = this.snapshot.eventsByRequestId[requestId] ?? [];
    events.push(event);
    this.snapshot.eventsByRequestId[requestId] = events;
  }

  private transitionState(
    request: OrchestratorRequest,
    next: OrchestratorRequestState,
    summary: string,
    eventType: OrchestratorEvent['type'],
    meta?: EventMeta
  ) {
    request.state = next;
    request.updatedAt = toIso(this.now());
    this.recordEvent(request.id, eventType, summary, meta);
  }

  private getLatestSpec(requestId: string): OrchestratorSpec | undefined {
    const request = this.snapshot.requests[requestId];
    const specId = request?.latestSpecId;
    if (!specId) return undefined;
    return this.snapshot.specs[specId];
  }

  private getLatestPlan(requestId: string): OrchestratorPlan | undefined {
    const request = this.snapshot.requests[requestId];
    const planId = request?.latestPlanId;
    if (!planId) return undefined;
    return this.snapshot.plans[planId];
  }

  private getLatestDelivery(requestId: string): OrchestratorDelivery | undefined {
    const request = this.snapshot.requests[requestId];
    const deliveryId = request?.latestDeliveryId;
    if (!deliveryId) return undefined;
    return this.snapshot.deliveries[deliveryId];
  }

  private listTasksForRequest(requestId: string): OrchestratorTask[] {
    return Object.values(this.snapshot.tasks).filter((task) => task.requestId === requestId);
  }

  private listRunsForRequest(requestId: string): OrchestratorRun[] {
    return Object.values(this.snapshot.runs).filter((run) => run.requestId === requestId);
  }

  private listApprovalsForRequest(requestId: string): OrchestratorApproval[] {
    return Object.values(this.snapshot.approvals).filter((approval) => approval.requestId === requestId);
  }

  private listReportsForRequest(requestId: string): OrchestratorTestReport[] {
    return Object.values(this.snapshot.testReports).filter((report) => report.requestId === requestId);
  }

  private listNotificationsForRequest(requestId: string): OrchestratorNotification[] {
    return Object.values(this.snapshot.notifications).filter((notification) => notification.requestId === requestId);
  }

  private buildNotificationText(
    request: OrchestratorRequest,
    kind: OrchestratorNotificationKind,
    extra?: Record<string, string>
  ): { title: string; body: string } {
    const timeline = request.acceptanceTimeline;
    const version = this.getLatestDelivery(request.id)?.version ?? '-';
    if (kind === 'delivery_ready') {
      return {
        title: `${request.projectId} 已进入验收阶段`,
        body:
          `你的工单 ${request.id} 已生成交付包 v${version}。` +
          `${timeline ? ` 请在 ${timeline.l1DueAt} 前确认是否通过验收。` : ' 请尽快确认是否通过验收。'}`
      };
    }
    if (kind === 'acceptance_reminder_l1') {
      return {
        title: `${request.projectId} 验收提醒（第 1 次）`,
        body:
          `工单 ${request.id} 的交付包 v${version} 还未确认。` +
          `${timeline ? ` 如果继续无响应，我会在 ${timeline.l2DueAt} 再提醒一次。` : ''}`
      };
    }
    if (kind === 'acceptance_reminder_l2') {
      return {
        title: `${request.projectId} 验收提醒（第 2 次）`,
        body:
          `工单 ${request.id} 仍未确认。` +
          `${timeline ? ` 如果继续无响应，我会在 ${timeline.l3DueAt} 升级为人工处理。` : ''}`
      };
    }
    if (kind === 'acceptance_escalated') {
      return {
        title: `${request.projectId} 已升级人工处理`,
        body:
          `工单 ${request.id} 已升级到人工处理。` +
          `${timeline ? ` 如果仍无处理，将在 ${timeline.pauseDueAt} 自动暂停。` : ''}`
      };
    }
    if (kind === 'paused_no_response') {
      return {
        title: `${request.projectId} 已暂停等待处理`,
        body: `工单 ${request.id} 因长时间无响应已自动暂停，可由运营人员恢复后继续。`
      };
    }
    if (kind === 'approval_required') {
      return {
        title: `${request.projectId} 需要审批后继续`,
        body: `工单 ${request.id} 命中 ${request.riskLevel} 风险策略，需要审批通过后继续执行。`
      };
    }
    return {
      title: `${request.projectId} 审批超时`,
      body: `工单 ${request.id} 的审批已超时，系统已进入暂停等待人工处理。${extra?.approvalId ? ` 审批单：${extra.approvalId}` : ''}`
    };
  }

  private upsertNotification(
    request: OrchestratorRequest,
    kind: OrchestratorNotificationKind,
    channel: OrchestratorNotificationChannel = 'internal',
    extra?: Record<string, string>
  ) {
    const dedupeKey = `${request.id}:${kind}:${channel}`;
    const existed = Object.values(this.snapshot.notifications).find((item) => item.dedupeKey === dedupeKey);
    const text = this.buildNotificationText(request, kind, extra);
    const nowIso = toIso(this.now());

    if (existed) {
      existed.title = text.title;
      existed.body = text.body;
      existed.status = 'pending';
      existed.updatedAt = nowIso;
      existed.lastError = undefined;
      return existed;
    }

    const notification: OrchestratorNotification = {
      id: this.makeId('ntf'),
      requestId: request.id,
      channel,
      kind,
      title: text.title,
      body: text.body,
      status: 'pending',
      toUserId: request.requesterId,
      toUserName: undefined,
      dedupeKey,
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.snapshot.notifications[notification.id] = notification;
    return notification;
  }

  private queueNotification(
    request: OrchestratorRequest,
    kind: OrchestratorNotificationKind,
    extra?: Record<string, string>
  ) {
    for (const channel of this.notificationChannels) {
      this.upsertNotification(request, kind, channel, extra);
    }
  }

  private async dispatchPendingNotificationsForRequest(requestId: string) {
    const nowIso = toIso(this.now());
    const notifications = this.listNotificationsForRequest(requestId).filter((notification) => notification.status === 'pending');
    for (const notification of notifications) {
      notification.attempts += 1;
      const result = await this.notificationSender.send(notification);
      if (result.ok) {
        notification.status = 'sent';
        notification.sentAt = nowIso;
        notification.updatedAt = nowIso;
        notification.lastError = undefined;
        continue;
      }
      notification.status = 'failed';
      notification.lastError = result.error;
      notification.updatedAt = nowIso;
    }
  }

  private currentVersionForRequest(requestId: string): number {
    const specs = Object.values(this.snapshot.specs).filter((spec) => spec.requestId === requestId);
    if (specs.length === 0) return 0;
    return Math.max(...specs.map((spec) => spec.version));
  }

  private generateSpec(request: OrchestratorRequest): OrchestratorSpec {
    const version = this.currentVersionForRequest(request.id) + 1;
    const spec: OrchestratorSpec = {
      id: this.makeId('spec'),
      requestId: request.id,
      version,
      summary: `围绕诉求“${request.intent}”生成结果导向需求（v${version}）。`,
      requirements: [
        '系统自动完成需求澄清、方案固化、开发实现、测试验证与结果交付。',
        '甲方仅在结果验收阶段参与确认，不要求关注代码实现细节。'
      ],
      acceptanceCriteria: [
        '结果包必须包含业务验收卡与可演示链接。',
        '超时未验收时，系统按 24h / 48h / 72h 执行提醒和升级，升级后仍未处理则暂停。'
      ],
      frozenAt: toIso(this.now())
    };
    this.snapshot.specs[spec.id] = spec;
    request.latestSpecId = spec.id;
    return spec;
  }

  private generatePlan(request: OrchestratorRequest, spec: OrchestratorSpec): OrchestratorPlan {
    const previousPlans = Object.values(this.snapshot.plans).filter((plan) => plan.requestId === request.id);
    const version = previousPlans.length + 1;
    const planId = this.makeId('plan');
    const taskAnalysisId = this.makeId('task');
    const taskBuildId = this.makeId('task');
    const taskTestId = this.makeId('task');
    const taskDeliveryId = this.makeId('task');

    const tasks: OrchestratorTask[] = [
      {
        id: taskAnalysisId,
        planId,
        requestId: request.id,
        title: '自动澄清并冻结需求',
        type: 'analysis',
        assignedAgent: 'claude',
        dependsOnTaskIds: [],
        state: 'succeeded',
        retries: 0
      },
      {
        id: taskBuildId,
        planId,
        requestId: request.id,
        title: '实现结果导向能力',
        type: 'implementation',
        assignedAgent: 'codex',
        dependsOnTaskIds: [taskAnalysisId],
        state: 'pending',
        retries: 0
      },
      {
        id: taskTestId,
        planId,
        requestId: request.id,
        title: '执行自动测试与验证',
        type: 'test',
        assignedAgent: 'codex',
        dependsOnTaskIds: [taskBuildId],
        state: 'pending',
        retries: 0
      },
      {
        id: taskDeliveryId,
        planId,
        requestId: request.id,
        title: '生成业务验收卡与演示链接',
        type: 'delivery',
        assignedAgent: 'system',
        dependsOnTaskIds: [taskTestId],
        state: 'pending',
        retries: 0
      }
    ];

    for (const task of tasks) this.snapshot.tasks[task.id] = task;

    const plan: OrchestratorPlan = {
      id: planId,
      requestId: request.id,
      specId: spec.id,
      version,
      agentStrategy: 'claude-analysis + codex-implementation',
      riskLevel: request.riskLevel,
      state: 'committed',
      taskIds: tasks.map((task) => task.id),
      createdAt: toIso(this.now()),
      updatedAt: toIso(this.now())
    };
    this.snapshot.plans[plan.id] = plan;
    request.latestPlanId = plan.id;
    return plan;
  }

  private createPendingApproval(request: OrchestratorRequest): OrchestratorApproval {
    const existing = this.listApprovalsForRequest(request.id).find((approval) => approval.decision === 'pending');
    if (existing) return existing;
    const now = this.now();
    const approval: OrchestratorApproval = {
      id: this.makeId('approval'),
      requestId: request.id,
      scope: 'request',
      reason: 'R3 高风险动作需要人工审批后才允许自动执行。',
      requiredRole: 'operator',
      decision: 'pending',
      expiresAt: toIso(addHours(now, 24)),
      createdAt: toIso(now),
      updatedAt: toIso(now)
    };
    this.snapshot.approvals[approval.id] = approval;
    return approval;
  }

  private markTaskState(requestId: string, taskType: OrchestratorTask['type'], state: OrchestratorTask['state']) {
    const tasks = this.listTasksForRequest(requestId).filter((task) => task.type === taskType);
    for (const task of tasks) task.state = state;
  }

  private createRun(requestId: string, taskId: string, stage: OrchestratorRun['stage'], state: OrchestratorRun['state']) {
    const attempts = this.listRunsForRequest(requestId).filter((run) => run.stage === stage).length + 1;
    const nowIso = toIso(this.now());
    const run: OrchestratorRun = {
      id: this.makeId('run'),
      requestId,
      taskId,
      executor: stage === 'build' || stage === 'test' ? 'codex' : 'system',
      stage,
      attempt: attempts,
      checkpointUri: `checkpoint://${requestId}/${stage}/${attempts}`,
      state,
      exitCode: state === 'failed' ? 1 : state === 'paused' ? null : 0,
      startedAt: nowIso,
      endedAt: state === 'running' || state === 'paused' ? undefined : nowIso
    };
    this.snapshot.runs[run.id] = run;
    return run;
  }

  private generateTestReport(requestId: string, runId: string): OrchestratorTestReport {
    const report: OrchestratorTestReport = {
      id: this.makeId('report'),
      requestId,
      runId,
      suite: 'orchestrator-smoke-and-regression',
      passRate: 1,
      failedCases: [],
      verdict: 'pass',
      createdAt: toIso(this.now())
    };
    this.snapshot.testReports[report.id] = report;
    return report;
  }

  private buildDelivery(request: OrchestratorRequest): OrchestratorDelivery {
    const version =
      Object.values(this.snapshot.deliveries).filter((delivery) => delivery.requestId === request.id).length + 1;
    const nowIso = toIso(this.now());
    const slug = slugFromIntent(request.intent);
    const delivery: OrchestratorDelivery = {
      id: this.makeId('delivery'),
      requestId: request.id,
      version,
      artifactUri: `artifact://specwave/${request.id}/v${version}`,
      demoLink: `https://demo.specwave.local/${request.projectId}/${request.id}/v${version}-${slug}`,
      releaseState: 'ready',
      resultCard: {
        title: `业务验收卡 v${version}`,
        summary: `系统已根据诉求“${request.intent}”自动完成方案、实现与测试，请仅对业务结果验收。`,
        businessChecks: [
          {
            name: '结果包完整性',
            status: 'pass',
            detail: '包含业务验收卡、可演示链接、风险说明与版本信息。'
          },
          {
            name: '自动化测试',
            status: 'pass',
            detail: '自动回归执行通过，未发现阻断级失败。'
          }
        ],
        risks: request.riskLevel === 'R3' ? ['高风险动作已走审批闸门。'] : []
      },
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.snapshot.deliveries[delivery.id] = delivery;
    request.latestDeliveryId = delivery.id;
    return delivery;
  }

  private restartAcceptanceTimeline(request: OrchestratorRequest) {
    const now = this.now();
    const l1DueAt = addHours(now, this.acceptanceWindow!.l1Hours);
    const l2DueAt = addHours(now, this.acceptanceWindow!.l2Hours);
    const l3DueAt = addHours(now, this.acceptanceWindow!.l3Hours);
    const pauseDueAt = addHours(l3DueAt, this.acceptanceWindow!.pauseAfterEscalationHours);
    request.acceptanceTimeline = {
      acceptanceStartedAt: toIso(now),
      l1DueAt: toIso(l1DueAt),
      l2DueAt: toIso(l2DueAt),
      l3DueAt: toIso(l3DueAt),
      pauseDueAt: toIso(pauseDueAt)
    };
  }

  private async progressRequest(request: OrchestratorRequest) {
    let guard = 0;
    while (guard < 30) {
      guard += 1;
      if (request.state === 'INTAKE') {
        this.transitionState(request, 'CLARIFY', '诉求已接收，进入自动澄清。', 'ClarificationClosed');
        continue;
      }
      if (request.state === 'CLARIFY') {
        this.generateSpec(request);
        this.transitionState(request, 'SPEC_FREEZE', '需求文档已冻结。', 'SpecFrozen');
        continue;
      }
      if (request.state === 'SPEC_FREEZE') {
        const spec = this.getLatestSpec(request.id);
        if (!spec) throw new OrchestratorServiceError(500, 'SPEC_MISSING', '需求冻结后未找到 Spec。');
        this.generatePlan(request, spec);
        this.transitionState(request, 'PLAN_COMMIT', '执行计划已提交。', 'PlanCommitted');
        continue;
      }
      if (request.state === 'PLAN_COMMIT') {
        if (this.approvalRequiredRiskLevels.has(request.riskLevel)) {
          const approval = this.createPendingApproval(request);
          this.transitionState(
            request,
            'WAITING_APPROVAL',
            `检测到 ${request.riskLevel} 风险，等待人工审批后继续。`,
            'ApprovalRequested',
            { approvalId: approval.id }
          );
          this.queueNotification(request, 'approval_required', { approvalId: approval.id });
          await this.dispatchPendingNotificationsForRequest(request.id);
          break;
        }
        this.transitionState(request, 'BUILD_RUN', '开始自动实现。', 'RunStarted', { stage: 'build' });
        continue;
      }
      if (request.state === 'WAITING_APPROVAL') {
        break;
      }
      if (request.state === 'BUILD_RUN') {
        const task = this.listTasksForRequest(request.id).find((item) => item.type === 'implementation');
        if (!task) throw new OrchestratorServiceError(500, 'TASK_MISSING', '缺少实现任务。');
        this.markTaskState(request.id, 'implementation', 'running');
        const run = this.createRun(request.id, task.id, 'build', 'succeeded');
        this.markTaskState(request.id, 'implementation', 'succeeded');
        this.recordEvent(request.id, 'RunCompleted', '实现阶段执行完成。', { runId: run.id, stage: 'build' });
        this.transitionState(request, 'TEST_RUN', '开始自动测试。', 'RunStarted', { stage: 'test' });
        continue;
      }
      if (request.state === 'TEST_RUN') {
        const task = this.listTasksForRequest(request.id).find((item) => item.type === 'test');
        if (!task) throw new OrchestratorServiceError(500, 'TASK_MISSING', '缺少测试任务。');
        this.markTaskState(request.id, 'test', 'running');
        const run = this.createRun(request.id, task.id, 'test', 'succeeded');
        this.markTaskState(request.id, 'test', 'succeeded');
        const report = this.generateTestReport(request.id, run.id);
        this.recordEvent(request.id, 'TestEvaluated', '自动测试通过。', {
          reportId: report.id,
          passRate: report.passRate
        });
        this.transitionState(request, 'DELIVERY_DRAFT', '生成交付结果包。', 'DeliveryReady');
        continue;
      }
      if (request.state === 'DELIVERY_DRAFT') {
        this.markTaskState(request.id, 'delivery', 'running');
        this.buildDelivery(request);
        this.markTaskState(request.id, 'delivery', 'succeeded');
        this.restartAcceptanceTimeline(request);
        this.transitionState(request, 'ACCEPTANCE_PENDING', '结果包已就绪，等待甲方验收。', 'DeliveryReady');
        this.queueNotification(request, 'delivery_ready');
        await this.dispatchPendingNotificationsForRequest(request.id);
        break;
      }
      if (request.state === 'REWORK') {
        this.transitionState(request, 'SPEC_FREEZE', '进入返工流程，重新生成方案。', 'AcceptanceUpdated');
        continue;
      }
      break;
    }
  }

  private createPausedRunForRequest(request: OrchestratorRequest, reason: string): OrchestratorRun {
    const run = this.createRun(request.id, `request:${request.id}`, 'orchestration', 'paused');
    this.recordEvent(request.id, 'RunPaused', reason, { runId: run.id, stage: 'orchestration' });
    return run;
  }

  async createRequest(input: OrchestratorCreateRequestInput): Promise<OrchestratorCreateRequestOutput> {
    this.ensureInitialized();
    if (!input.idempotencyKey?.trim()) {
      throw new OrchestratorServiceError(400, 'IDEMPOTENCY_REQUIRED', 'idempotencyKey 不能为空。');
    }
    const existingRequestId = this.snapshot.idempotencyToRequestId[input.idempotencyKey];
    if (existingRequestId) {
      const existing = this.ensureRequest(existingRequestId);
      const pendingApproval = this.listApprovalsForRequest(existing.id).find((item) => item.decision === 'pending');
      return {
        requestId: existing.id,
        state: existing.state,
        acceptanceRequired: existing.state === 'ACCEPTANCE_PENDING' || existing.state === 'DONE',
        pendingApprovalId: pendingApproval?.id
      };
    }

    if (!input.tenantId || !input.projectId || !input.intent || !input.requesterId) {
      throw new OrchestratorServiceError(400, 'INVALID_INPUT', 'tenantId/projectId/intent/requesterId 必填。');
    }

    this.ensureProject(input.tenantId, input.projectId);
    const nowIso = toIso(this.now());
    const requestId = this.makeId('req');
    const request: OrchestratorRequest = {
      id: requestId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      sourceChannel: input.sourceChannel,
      requesterId: input.requesterId,
      intent: input.intent.trim(),
      priority: input.priority ?? 'normal',
      riskLevel: input.riskLevel ?? 'R1',
      state: 'INTAKE',
      correlationId: input.correlationId ?? this.makeId('corr'),
      createdAt: nowIso,
      updatedAt: nowIso,
      autoProgressEnabled: true
    };
    this.snapshot.requests[request.id] = request;
    this.snapshot.idempotencyToRequestId[input.idempotencyKey] = request.id;
    this.recordEvent(request.id, 'RequestCreated', '收到新诉求并创建请求。', {
      sourceChannel: request.sourceChannel,
      priority: request.priority,
      riskLevel: request.riskLevel
    });

    await this.progressRequest(request);
    await this.persist();

    const pendingApproval = this.listApprovalsForRequest(request.id).find((item) => item.decision === 'pending');
    return {
      requestId: request.id,
      state: request.state,
      acceptanceRequired: request.state === 'ACCEPTANCE_PENDING',
      pendingApprovalId: pendingApproval?.id
    };
  }

  async getRequestDetail(requestId: string): Promise<OrchestratorRequestDetail> {
    this.ensureInitialized();
    const request = this.ensureRequest(requestId);
    const tasks = this.listTasksForRequest(requestId);
    const runs = this.listRunsForRequest(requestId);
    const testReports = this.listReportsForRequest(requestId);
    const notifications = this.listNotificationsForRequest(requestId);
    const pendingApprovals = this.listApprovalsForRequest(requestId).filter((approval) => approval.decision === 'pending');
    return {
      request,
      spec: this.getLatestSpec(requestId),
      plan: this.getLatestPlan(requestId),
      tasks,
      runs,
      testReports,
      delivery: this.getLatestDelivery(requestId),
      notifications,
      pendingApprovals,
      events: this.snapshot.eventsByRequestId[requestId] ?? []
    };
  }

  async listNotifications(options?: {
    requestId?: string;
    status?: OrchestratorNotification['status'];
  }): Promise<OrchestratorNotification[]> {
    this.ensureInitialized();
    let items = Object.values(this.snapshot.notifications);
    if (options?.requestId) items = items.filter((item) => item.requestId === options.requestId);
    if (options?.status) items = items.filter((item) => item.status === options.status);
    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async ackNotification(notificationId: string, actorId: string): Promise<OrchestratorNotification> {
    this.ensureInitialized();
    const notification = this.snapshot.notifications[notificationId];
    if (!notification) {
      throw new OrchestratorServiceError(404, 'NOTIFICATION_NOT_FOUND', `未找到通知：${notificationId}`);
    }
    const nowIso = toIso(this.now());
    notification.status = 'acked';
    notification.ackedAt = nowIso;
    notification.updatedAt = nowIso;
    this.recordEvent(notification.requestId, 'ReminderSent', `通知已确认：${notification.kind}`, {
      notificationId: notification.id,
      actorId
    });
    await this.persist();
    return notification;
  }

  async getMetricsSummary(): Promise<OrchestratorMetricsSummary> {
    this.ensureInitialized();
    const requests = Object.values(this.snapshot.requests);
    const stateCount = {
      INTAKE: 0,
      CLARIFY: 0,
      SPEC_FREEZE: 0,
      PLAN_COMMIT: 0,
      WAITING_APPROVAL: 0,
      BUILD_RUN: 0,
      TEST_RUN: 0,
      DELIVERY_DRAFT: 0,
      ACCEPTANCE_PENDING: 0,
      REMINDER_L1: 0,
      REMINDER_L2: 0,
      ESCALATION_L3: 0,
      PAUSED_BY_NO_RESPONSE: 0,
      REWORK: 0,
      DONE: 0,
      FAILED: 0
    } as Record<OrchestratorRequestState, number>;
    for (const request of requests) stateCount[request.state] += 1;

    let deliveryTotalHours = 0;
    let deliveryCount = 0;
    for (const request of requests) {
      const delivery = this.getLatestDelivery(request.id);
      if (!delivery) continue;
      const start = new Date(request.createdAt).getTime();
      const end = new Date(delivery.createdAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        deliveryTotalHours += (end - start) / ONE_HOUR_MS;
        deliveryCount += 1;
      }
    }

    const notifications = Object.values(this.snapshot.notifications);
    return {
      generatedAt: toIso(this.now()),
      totalRequests: requests.length,
      stateCount,
      doneCount: stateCount.DONE,
      pausedCount: stateCount.PAUSED_BY_NO_RESPONSE,
      acceptancePendingCount:
        stateCount.ACCEPTANCE_PENDING +
        stateCount.REMINDER_L1 +
        stateCount.REMINDER_L2 +
        stateCount.ESCALATION_L3,
      reminderCount: stateCount.REMINDER_L1 + stateCount.REMINDER_L2,
      escalationCount: stateCount.ESCALATION_L3,
      avgDeliveryHours: deliveryCount > 0 ? Number((deliveryTotalHours / deliveryCount).toFixed(3)) : 0,
      notificationPendingCount: notifications.filter((item) => item.status === 'pending').length,
      notificationFailedCount: notifications.filter((item) => item.status === 'failed').length
    };
  }

  async submitAcceptance(requestId: string, input: OrchestratorAcceptanceInput): Promise<OrchestratorRequestDetail> {
    this.ensureInitialized();
    const request = this.ensureRequest(requestId);
    const allowedStates: OrchestratorRequestState[] = [
      'ACCEPTANCE_PENDING',
      'REMINDER_L1',
      'REMINDER_L2',
      'ESCALATION_L3',
      'PAUSED_BY_NO_RESPONSE'
    ];
    if (!allowedStates.includes(request.state)) {
      throw new OrchestratorServiceError(409, 'INVALID_STATE', `当前状态 ${request.state} 不允许提交验收。`);
    }

    const actor = { type: 'client' as const, id: input.actorId, displayName: input.actorName };
    const delivery = this.getLatestDelivery(request.id);

    if (input.action === 'approve') {
      if (delivery) {
        delivery.releaseState = 'accepted';
        delivery.updatedAt = toIso(this.now());
      }
      request.acceptanceTimeline = undefined;
      this.transitionState(request, 'DONE', '甲方验收通过，流程完成。', 'AcceptanceUpdated', {
        action: 'approve'
      });
      this.recordEvent(request.id, 'AcceptanceUpdated', input.comment?.trim() || '甲方确认结果通过。', undefined, actor);
    } else {
      if (delivery) {
        delivery.releaseState = 'rejected';
        delivery.updatedAt = toIso(this.now());
      }
      this.transitionState(request, 'REWORK', '甲方拒绝当前结果，进入返工。', 'AcceptanceUpdated', {
        action: 'reject'
      });
      this.recordEvent(
        request.id,
        'AcceptanceUpdated',
        input.comment?.trim() || '甲方要求返工。',
        { action: 'reject' },
        actor
      );
      await this.progressRequest(request);
    }

    await this.persist();
    return this.getRequestDetail(requestId);
  }

  async submitApproval(input: OrchestratorApprovalInput): Promise<OrchestratorRequestDetail> {
    this.ensureInitialized();
    const approval = this.ensureApproval(input.approvalId);
    if (approval.decision !== 'pending') {
      throw new OrchestratorServiceError(409, 'APPROVAL_ALREADY_DECIDED', '审批单已处理。');
    }

    const nowIso = toIso(this.now());
    const request = this.ensureRequest(approval.requestId);
    approval.decision = input.decision;
    approval.decidedAt = nowIso;
    approval.decidedBy = input.actorId;
    approval.updatedAt = nowIso;

    const actor = { type: 'operator' as const, id: input.actorId, displayName: input.actorName };
    this.recordEvent(request.id, 'ApprovalResolved', `审批已${input.decision === 'approved' ? '通过' : '拒绝'}。`, {
      approvalId: approval.id
    }, actor);

    if (input.decision === 'approved') {
      if (request.state === 'WAITING_APPROVAL') {
        this.transitionState(request, 'BUILD_RUN', '高风险审批通过，继续自动执行。', 'ApprovalResolved', {
          approvalId: approval.id,
          decision: 'approved'
        });
        await this.progressRequest(request);
      }
    } else if (request.state === 'WAITING_APPROVAL') {
      this.transitionState(request, 'PAUSED_BY_NO_RESPONSE', '高风险审批被拒绝，流程暂停。', 'ApprovalResolved', {
        approvalId: approval.id,
        decision: 'rejected'
      });
      this.queueNotification(request, 'paused_no_response');
      await this.dispatchPendingNotificationsForRequest(request.id);
      this.createPausedRunForRequest(request, '审批拒绝后暂停自动执行。');
    }

    await this.persist();
    return this.getRequestDetail(request.id);
  }

  async resumeRun(runId: string, input: OrchestratorRunResumeInput): Promise<OrchestratorRequestDetail> {
    this.ensureInitialized();
    const run = this.ensureRun(runId);
    if (run.state !== 'paused') {
      throw new OrchestratorServiceError(409, 'RUN_NOT_PAUSED', `运行 ${runId} 当前不是暂停态。`);
    }
    const request = this.ensureRequest(run.requestId);
    const actor = { type: 'operator' as const, id: input.actorId, displayName: input.actorName };
    const nowIso = toIso(this.now());

    run.state = 'resumed';
    run.endedAt = nowIso;
    run.exitCode = 0;
    this.recordEvent(request.id, 'RunResumed', input.reason?.trim() || '人工恢复执行。', {
      runId: run.id
    }, actor);
    run.state = 'succeeded';
    this.recordEvent(request.id, 'RunCompleted', '恢复后执行完成。', { runId: run.id }, actor);

    if (request.state === 'PAUSED_BY_NO_RESPONSE') {
      this.restartAcceptanceTimeline(request);
      this.transitionState(request, 'ACCEPTANCE_PENDING', '已恢复验收流程，重新等待甲方确认。', 'RunResumed');
    }

    await this.persist();
    return this.getRequestDetail(request.id);
  }

  async receiveWebhook(channel: string, payload: OrchestratorWebhookPayload): Promise<OrchestratorCreateRequestOutput> {
    this.ensureInitialized();
    return this.createRequest({
      tenantId: payload.tenantId,
      projectId: payload.projectId,
      sourceChannel: channel,
      requesterId: payload.userId,
      requesterName: payload.userName,
      intent: payload.message,
      riskLevel: payload.riskLevel ?? 'R1',
      idempotencyKey: payload.idempotencyKey,
      correlationId: `${payload.externalChatId}:${payload.threadId ?? 'root'}`
    });
  }

  async getResultCard(deliveryId: string): Promise<OrchestratorResultCardOutput> {
    this.ensureInitialized();
    const delivery = this.snapshot.deliveries[deliveryId];
    if (!delivery) {
      throw new OrchestratorServiceError(404, 'DELIVERY_NOT_FOUND', `未找到交付物：${deliveryId}`);
    }
    return {
      deliveryId: delivery.id,
      requestId: delivery.requestId,
      version: delivery.version,
      title: delivery.resultCard.title,
      summary: delivery.resultCard.summary,
      businessChecks: delivery.resultCard.businessChecks,
      risks: delivery.resultCard.risks
    };
  }

  async getDemoLink(deliveryId: string): Promise<OrchestratorDemoLinkOutput> {
    this.ensureInitialized();
    const delivery = this.snapshot.deliveries[deliveryId];
    if (!delivery) {
      throw new OrchestratorServiceError(404, 'DELIVERY_NOT_FOUND', `未找到交付物：${deliveryId}`);
    }
    const expiresAt = toIso(addHours(new Date(delivery.createdAt), DEMO_LINK_HOURS));
    return {
      deliveryId: delivery.id,
      requestId: delivery.requestId,
      demoLink: delivery.demoLink,
      expiresAt
    };
  }

  private async expirePendingApproval(approval: OrchestratorApproval, request: OrchestratorRequest) {
    approval.decision = 'expired';
    approval.updatedAt = toIso(this.now());
    this.recordEvent(request.id, 'ApprovalResolved', '审批超时已过期。', { approvalId: approval.id, decision: 'expired' });
    this.transitionState(request, 'PAUSED_BY_NO_RESPONSE', '审批超时未处理，流程暂停。', 'PausedByNoResponse');
    this.queueNotification(request, 'approval_expired', { approvalId: approval.id });
    this.queueNotification(request, 'paused_no_response');
    await this.dispatchPendingNotificationsForRequest(request.id);
    this.createPausedRunForRequest(request, '审批超时后暂停。');
  }

  private async sendReminder(request: OrchestratorRequest, level: 1 | 2) {
    this.recordEvent(request.id, 'ReminderSent', `已发送 L${level} 催办提醒。`, { level });
    this.queueNotification(request, level === 1 ? 'acceptance_reminder_l1' : 'acceptance_reminder_l2');
    await this.dispatchPendingNotificationsForRequest(request.id);
  }

  async tick(nowInput?: Date): Promise<OrchestratorTickSummary> {
    this.ensureInitialized();
    const summary: OrchestratorTickSummary = {
      scannedRequests: 0,
      transitionedRequests: 0,
      remindersSent: 0,
      escalations: 0,
      pausedByNoResponse: 0
    };
    const now = nowInput ? new Date(nowInput.getTime()) : this.now();

    for (const request of Object.values(this.snapshot.requests)) {
      summary.scannedRequests += 1;
      const timeline = request.acceptanceTimeline;
      const previousState = request.state;

      if (request.state === 'WAITING_APPROVAL') {
        const pending = this.listApprovalsForRequest(request.id).find((approval) => approval.decision === 'pending');
        if (pending && new Date(pending.expiresAt).getTime() <= now.getTime()) {
          await this.expirePendingApproval(pending, request);
        }
      }

      if (timeline) {
        const nowTs = now.getTime();
        if (request.state === 'ACCEPTANCE_PENDING' && nowTs >= new Date(timeline.l1DueAt).getTime()) {
          this.transitionState(request, 'REMINDER_L1', '验收超时，触发一级催办。', 'ReminderSent', { level: 1 });
          await this.sendReminder(request, 1);
          summary.remindersSent += 1;
        } else if (request.state === 'REMINDER_L1' && nowTs >= new Date(timeline.l2DueAt).getTime()) {
          this.transitionState(request, 'REMINDER_L2', '验收仍超时，触发二级催办。', 'ReminderSent', { level: 2 });
          await this.sendReminder(request, 2);
          summary.remindersSent += 1;
        } else if (request.state === 'REMINDER_L2' && nowTs >= new Date(timeline.l3DueAt).getTime()) {
          this.transitionState(request, 'ESCALATION_L3', '验收超时升级到人工处理。', 'Escalated', { level: 3 });
          this.queueNotification(request, 'acceptance_escalated');
          await this.dispatchPendingNotificationsForRequest(request.id);
          summary.escalations += 1;
        } else if (request.state === 'ESCALATION_L3' && nowTs >= new Date(timeline.pauseDueAt).getTime()) {
          this.transitionState(
            request,
            'PAUSED_BY_NO_RESPONSE',
            '升级后仍无处理，流程自动暂停。',
            'PausedByNoResponse'
          );
          this.queueNotification(request, 'paused_no_response');
          await this.dispatchPendingNotificationsForRequest(request.id);
          this.createPausedRunForRequest(request, '升级后无人处理，自动暂停。');
          summary.pausedByNoResponse += 1;
        }
      }

      if (request.state !== previousState) {
        summary.transitionedRequests += 1;
      }
    }

    await this.persist();
    return summary;
  }
}
