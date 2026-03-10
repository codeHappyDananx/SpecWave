import { randomUUID } from 'node:crypto';
import type {
  ApprovalCheckpoint,
  AssistantChatInput,
  AssistantChatOutput,
  AssistantOnboardingContinueInput,
  AssistantOnboardingFinishInput,
  AssistantOnboardingOutput,
  AssistantOnboardingSession,
  AssistantOnboardingStartInput,
  AssistantSessionApprovalInput,
  AssistantSessionApprovalOutput,
  CapabilityPackId,
  CapabilityPackManifest,
  ConversationIntentKind,
  ConversationSession,
  ExecutionEvidence,
  ExecutionIntent,
  OrchestratorRiskLevel,
  UserProfile
} from '../../../packages/contracts/src/orchestrator';
import type { AgentRuntime } from './agentRuntime';
import { BUILTIN_CAPABILITY_PACKS, getCapabilityPackById } from './capabilityPacks';

type AssistantSnapshot = {
  profiles: Record<string, UserProfile>;
  onboardingSessions: Record<string, AssistantOnboardingSession>;
  activeOnboardingSessionIdByUser: Record<string, string>;
  sessions: Record<string, ConversationSession>;
  transcriptsBySessionId: Record<string, Array<{ role: 'assistant' | 'user'; content: string; at: string }>>;
  evidencesBySessionId: Record<string, ExecutionEvidence[]>;
  approvals: Record<string, ApprovalCheckpoint>;
};

type AssistantStateStore = {
  load(): Promise<AssistantSnapshot | null>;
  save(snapshot: AssistantSnapshot): Promise<void>;
};

type AssistantServiceOptions = {
  now?: () => Date;
  idFactory?: () => string;
  agentRuntime?: AgentRuntime;
};

const DEFAULT_SESSION_ID = 'assistant-main';
const APPROVAL_EXPIRE_HOURS = 24;

export class AssistantServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AssistantServiceError';
  }
}

function toIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function emptySnapshot(): AssistantSnapshot {
  return {
    profiles: {},
    onboardingSessions: {},
    activeOnboardingSessionIdByUser: {},
    sessions: {},
    transcriptsBySessionId: {},
    evidencesBySessionId: {},
    approvals: {}
  };
}

function normalizeSnapshot(raw: AssistantSnapshot | null): AssistantSnapshot {
  if (!raw) return emptySnapshot();
  return {
    profiles: raw.profiles ?? {},
    onboardingSessions: raw.onboardingSessions ?? {},
    activeOnboardingSessionIdByUser: raw.activeOnboardingSessionIdByUser ?? {},
    sessions: raw.sessions ?? {},
    transcriptsBySessionId: raw.transcriptsBySessionId ?? {},
    evidencesBySessionId: raw.evidencesBySessionId ?? {},
    approvals: raw.approvals ?? {}
  };
}

function normalizeList(value: string): string[] {
  return value
    .split(/[\n,，；;、]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textHasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((item) => lower.includes(item.toLowerCase()));
}

function guessCapabilityPacks(texts: string[]): CapabilityPackId[] {
  const joined = texts.join('\n');
  const result = new Set<CapabilityPackId>(['general-office']);
  if (textHasAny(joined, ['代码', '开发', '测试', '仓库', 'api', '前端', '后端', 'bug', 'git'])) result.add('software-dev');
  if (textHasAny(joined, ['金融', '基金', '股票', '报表', 'excel', 'csv', '财务', '投研', '同比', '环比'])) result.add('finance-analysis');
  if (textHasAny(joined, ['需求', 'prd', '原型', '流程', '验收', '产品', '方案'])) result.add('product-requirement');
  if (textHasAny(joined, ['调研', '研究', '咨询', '竞品', '资料', '行业', '分析'])) result.add('research-consulting');
  if (textHasAny(joined, ['桌面', '软件', '浏览器', '微信', '钉钉', 'telegram', '窗口', '下载'])) result.add('desktop-execution');
  return Array.from(result);
}

function detectRiskLevel(message: string): OrchestratorRiskLevel {
  if (textHasAny(message, ['删除', '覆盖', '批量', '转账', '付款', '生产', '上线', '发布', '发消息', '发送邮件', '群发'])) return 'R3';
  if (textHasAny(message, ['改代码', '修改文件', '运行测试', '执行命令', '部署', '自动化', '打开软件', '点击', '填写表单'])) return 'R2';
  if (textHasAny(message, ['分析', '总结', '整理', '草稿', '报表', '阅读', '检索', '调研'])) return 'R1';
  return 'R0';
}

function detectIntentKind(message: string): ConversationIntentKind {
  if (textHasAny(message, ['方案', '计划', 'spec', '需求文档', '技术方案'])) return 'formal_plan';
  if (textHasAny(message, ['审批', '批准', '确认执行'])) return 'approval';
  if (textHasAny(message, ['分析', '报表', '总结', '调研', '研究'])) return 'analysis';
  if (textHasAny(message, ['帮我做', '实现', '开发', '接入', '发送', '打开', '执行', '测试', '部署', '自动化'])) return 'automation';
  return 'chat';
}

function buildApprovalPolicyText(profile: UserProfile): string {
  return `自动放行到 ${profile.approvalPolicy.autoApproveUpTo}；${profile.approvalPolicy.notes.join('；')}`;
}

function buildProfileSummary(profile: UserProfile): string {
  return [
    `用户：${profile.displayName}`,
    `岗位：${profile.roleTitle || '未明确'}`,
    `行业：${profile.industry || '未明确'}`,
    `目标：${profile.workGoals.join('、') || '未明确'}`,
    `常见输出：${profile.commonDeliverables.join('、') || '未明确'}`,
    `常用工具：${profile.commonTools.join('、') || '未明确'}`,
    `能力包：${profile.enabledCapabilityPackIds.join('、') || '未启用'}`,
    `审批策略：${buildApprovalPolicyText(profile)}`
  ].join('\n');
}

function buildCapabilityInstruction(ids: CapabilityPackId[]): string[] {
  return ids
    .map((id) => getCapabilityPackById(id))
    .filter((item): item is CapabilityPackManifest => Boolean(item))
    .map((item) => `${item.name}：${item.defaultPrompt} 典型输出：${item.outputTemplate}`);
}

function onboardingQuestion(step: AssistantOnboardingSession['currentStep']): string {
  switch (step) {
    case 'role':
      return '先和我说说，你平时主要做什么工作，最好带上岗位、行业，和你最重要的一两个目标。';
    case 'tasks':
      return '你最常希望助理帮你处理哪些事情？可以直接说高频任务、常见输出物，或者你最烦的重复劳动。';
    case 'tools':
      return '你现在最常用哪些软件、项目目录、数据源或知识库？想到什么就直接说，我来帮你归类。';
    case 'automation':
      return '哪些事情你希望我默认自动做，哪些事情必须先问你？比如改代码、发消息、生成报表、动桌面软件。';
    default:
      return '我已经整理好了，看看这份理解是否准确；如果可以，就直接回“确认”。';
  }
}

function friendlyAck(step: AssistantOnboardingSession['currentStep']): string {
  switch (step) {
    case 'tasks':
      return '我记下你的工作背景了。';
    case 'tools':
      return '这些高频任务我已经抓到重点。';
    case 'automation':
      return '常用软件和上下文我也记住了。';
    default:
      return '收到。';
  }
}

function defaultProfile(userId: string, userName?: string, nowIso?: string): UserProfile {
  return {
    userId,
    displayName: userName?.trim() || userId,
    roleTitle: '',
    industry: '',
    workGoals: [],
    commonDeliverables: [],
    communicationStyle: 'hybrid',
    riskPreference: 'balanced',
    commonProjects: [],
    commonTools: [],
    dataSources: [],
    enabledCapabilityPackIds: ['general-office'],
    disabledCapabilityPackIds: [],
    approvalPolicy: {
      autoApproveUpTo: 'R1',
      notes: ['高风险动作先确认', '外发、删除、生产写操作必须审批']
    },
    createdAt: nowIso ?? new Date().toISOString(),
    updatedAt: nowIso ?? new Date().toISOString()
  };
}

export class AssistantService {
  private snapshot: AssistantSnapshot = emptySnapshot();
  private initialized = false;
  private readonly nowFn: () => Date;
  private readonly idFactory: () => string;
  private readonly agentRuntime?: AgentRuntime;

  constructor(private readonly store: AssistantStateStore, options: AssistantServiceOptions = {}) {
    this.nowFn = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.agentRuntime = options.agentRuntime;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.snapshot = normalizeSnapshot(await this.store.load());
    this.initialized = true;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new AssistantServiceError(503, 'ASSISTANT_NOT_INITIALIZED', 'assistant service 尚未初始化。');
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

  private appendTranscript(sessionId: string, role: 'assistant' | 'user', content: string) {
    const list = this.snapshot.transcriptsBySessionId[sessionId] ?? [];
    list.push({ role, content, at: toIso(this.now()) });
    this.snapshot.transcriptsBySessionId[sessionId] = list.slice(-30);
  }

  private appendEvidence(sessionId: string, userId: string, kind: ExecutionEvidence['kind'], summary: string, detail?: string, meta?: ExecutionEvidence['meta']) {
    const evidence: ExecutionEvidence = {
      id: this.makeId('evd'),
      sessionId,
      userId,
      kind,
      summary,
      detail,
      meta,
      createdAt: toIso(this.now())
    };
    const list = this.snapshot.evidencesBySessionId[sessionId] ?? [];
    list.push(evidence);
    this.snapshot.evidencesBySessionId[sessionId] = list.slice(-120);
    return evidence;
  }

  listCapabilityPacks(): CapabilityPackManifest[] {
    this.ensureInitialized();
    return BUILTIN_CAPABILITY_PACKS;
  }

  getProfile(userId: string): UserProfile | null {
    this.ensureInitialized();
    return this.snapshot.profiles[userId] ?? null;
  }

  async upsertProfile(userId: string, patch: Partial<UserProfile>, userName?: string): Promise<UserProfile> {
    this.ensureInitialized();
    const nowIso = toIso(this.now());
    const base = this.snapshot.profiles[userId] ?? defaultProfile(userId, userName, nowIso);
    const next: UserProfile = {
      ...base,
      ...patch,
      userId,
      displayName: patch.displayName?.trim() || base.displayName || userName?.trim() || userId,
      workGoals: patch.workGoals ?? base.workGoals,
      commonDeliverables: patch.commonDeliverables ?? base.commonDeliverables,
      commonProjects: patch.commonProjects ?? base.commonProjects,
      commonTools: patch.commonTools ?? base.commonTools,
      dataSources: patch.dataSources ?? base.dataSources,
      enabledCapabilityPackIds: patch.enabledCapabilityPackIds ?? base.enabledCapabilityPackIds,
      disabledCapabilityPackIds: patch.disabledCapabilityPackIds ?? base.disabledCapabilityPackIds,
      approvalPolicy: patch.approvalPolicy ?? base.approvalPolicy,
      updatedAt: nowIso,
      createdAt: base.createdAt || nowIso
    };
    this.snapshot.profiles[userId] = next;
    await this.persist();
    return next;
  }

  private ensureOnboardingSession(userId: string): AssistantOnboardingSession {
    const activeId = this.snapshot.activeOnboardingSessionIdByUser[userId];
    const session = activeId ? this.snapshot.onboardingSessions[activeId] : undefined;
    if (!session) {
      throw new AssistantServiceError(404, 'ONBOARDING_NOT_FOUND', `未找到用户 ${userId} 的初始化会话。`);
    }
    return session;
  }

  async startOnboarding(input: AssistantOnboardingStartInput): Promise<AssistantOnboardingOutput> {
    this.ensureInitialized();
    const nowIso = toIso(this.now());
    const session: AssistantOnboardingSession = {
      id: this.makeId('onb'),
      userId: input.userId,
      status: 'active',
      currentStep: 'role',
      draftProfile: {
        ...defaultProfile(input.userId, input.userName, nowIso),
        displayName: input.userName?.trim() || input.userId
      },
      recommendedCapabilityPackIds: ['general-office'],
      summary: '',
      transcript: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const reply = `你好，我会先花几分钟把你的工作画像摸清，这样后面我才能真的像助理一样接手任务。\n\n${onboardingQuestion('role')}`;
    session.transcript.push({ role: 'assistant', content: reply, at: nowIso });
    this.snapshot.onboardingSessions[session.id] = session;
    this.snapshot.activeOnboardingSessionIdByUser[input.userId] = session.id;
    this.appendEvidence(session.id, input.userId, 'onboarding_update', '启动初始化访谈');
    await this.persist();
    return { session, reply };
  }

  private summarizeOnboarding(session: AssistantOnboardingSession): { summary: string; profile: UserProfile } {
    const nowIso = toIso(this.now());
    const roleText = session.draftProfile.roleTitle?.trim() || '未明确岗位';
    const industryText = session.draftProfile.industry?.trim() || '未明确行业';
    const goals = session.draftProfile.workGoals ?? [];
    const deliverables = session.draftProfile.commonDeliverables ?? [];
    const tools = session.draftProfile.commonTools ?? [];
    const projects = session.draftProfile.commonProjects ?? [];
    const dataSources = session.draftProfile.dataSources ?? [];
    const packs = session.recommendedCapabilityPackIds
      .map((id) => getCapabilityPackById(id)?.name ?? id)
      .join('、');
    const profile: UserProfile = {
      ...(session.draftProfile as UserProfile),
      userId: session.userId,
      displayName: session.draftProfile.displayName?.trim() || session.userId,
      roleTitle: roleText,
      industry: industryText,
      workGoals: goals,
      commonDeliverables: deliverables,
      commonProjects: projects,
      commonTools: tools,
      dataSources,
      enabledCapabilityPackIds: session.recommendedCapabilityPackIds,
      disabledCapabilityPackIds: [],
      approvalPolicy: session.draftProfile.approvalPolicy ?? {
        autoApproveUpTo: 'R1',
        notes: ['低风险自动执行', '高风险动作先确认']
      },
      communicationStyle: session.draftProfile.communicationStyle ?? 'hybrid',
      riskPreference: session.draftProfile.riskPreference ?? 'balanced',
      createdAt: (session.draftProfile.createdAt as string) || nowIso,
      updatedAt: nowIso
    };
    const summary = [
      `我的理解是：你现在主要在做 ${roleText}${industryText ? `，领域偏 ${industryText}` : ''}。`,
      goals.length > 0 ? `你最在意的目标是：${goals.join('、')}。` : '你目前更希望我先把高频工作接住。',
      deliverables.length > 0 ? `高频输出物包括：${deliverables.join('、')}。` : '我会先按常见办公产物来支持你。',
      tools.length > 0 || projects.length > 0 || dataSources.length > 0
        ? `常用上下文里，我记住了这些：${[...tools, ...projects, ...dataSources].slice(0, 6).join('、')}。`
        : '软件、项目和数据源我会先按后续对话继续补全。',
      `我先给你装配这几类能力：${packs}。`,
      `审批策略先按“${profile.approvalPolicy.autoApproveUpTo} 及以下自动，高风险先确认”执行。`
    ].join('\n');
    return { summary, profile };
  }

  async continueOnboarding(input: AssistantOnboardingContinueInput): Promise<AssistantOnboardingOutput> {
    this.ensureInitialized();
    const session = this.ensureOnboardingSession(input.userId);
    const nowIso = toIso(this.now());
    const answer = input.message.trim();
    if (!answer) throw new AssistantServiceError(400, 'EMPTY_ONBOARDING_MESSAGE', '初始化回复不能为空。');
    session.updatedAt = nowIso;
    session.transcript.push({ role: 'user', content: answer, at: nowIso });
    this.appendEvidence(session.id, input.userId, 'onboarding_update', '收到初始化回复', answer);

    if (session.status === 'awaiting_confirmation') {
      const notes = session.draftProfile.freeformNotes ?? [];
      notes.push(answer);
      session.draftProfile.freeformNotes = notes.slice(-5);
      const nextPacks = guessCapabilityPacks([
        session.draftProfile.roleTitle ?? '',
        ...(session.draftProfile.workGoals ?? []),
        ...(session.draftProfile.commonTools ?? []),
        ...notes
      ]);
      session.recommendedCapabilityPackIds = nextPacks;
      const summary = this.summarizeOnboarding(session);
      session.summary = `${summary.summary}\n补充说明：${answer}`;
      const reply = `${session.summary}\n\n如果这版已经差不多了，直接回“确认”；如果还想补充，继续告诉我哪里需要修正。`;
      session.transcript.push({ role: 'assistant', content: reply, at: nowIso });
      await this.persist();
      return { session, reply };
    }

    if (session.currentStep === 'role') {
      session.draftProfile.roleTitle = answer;
      session.draftProfile.industry = answer;
      session.currentStep = 'tasks';
    } else if (session.currentStep === 'tasks') {
      session.draftProfile.workGoals = normalizeList(answer);
      session.draftProfile.commonDeliverables = normalizeList(answer);
      session.currentStep = 'tools';
    } else if (session.currentStep === 'tools') {
      session.draftProfile.commonTools = normalizeList(answer);
      session.draftProfile.commonProjects = normalizeList(answer);
      session.draftProfile.dataSources = normalizeList(answer);
      session.currentStep = 'automation';
    } else if (session.currentStep === 'automation') {
      session.draftProfile.automationPreference = answer;
      session.draftProfile.approvalPolicy = textHasAny(answer, ['都先确认', '都先问', '全部确认'])
        ? { autoApproveUpTo: 'R0', notes: ['所有动作先确认'] }
        : textHasAny(answer, ['尽量自动', '大部分自动', '能自动就自动'])
          ? { autoApproveUpTo: 'R2', notes: ['低中风险自动', '高风险动作先确认'] }
          : { autoApproveUpTo: 'R1', notes: ['低风险自动执行', '高风险动作先确认'] };
      session.draftProfile.riskPreference = textHasAny(answer, ['都先确认', '都先问']) ? 'cautious' : 'balanced';
      session.recommendedCapabilityPackIds = guessCapabilityPacks([
        session.draftProfile.roleTitle ?? '',
        ...(session.draftProfile.workGoals ?? []),
        ...(session.draftProfile.commonTools ?? []),
        answer
      ]);
      session.status = 'awaiting_confirmation';
      session.currentStep = 'confirm';
      const summary = this.summarizeOnboarding(session);
      session.summary = summary.summary;
      const reply = `${session.summary}\n\n如果没问题，直接回“确认”；如果有偏差，就继续告诉我怎么改。`;
      session.transcript.push({ role: 'assistant', content: reply, at: nowIso });
      await this.persist();
      return { session, reply };
    }

    const reply = `${friendlyAck(session.currentStep)}\n\n${onboardingQuestion(session.currentStep)}`;
    session.transcript.push({ role: 'assistant', content: reply, at: nowIso });
    await this.persist();
    return { session, reply };
  }

  async finishOnboarding(input: AssistantOnboardingFinishInput): Promise<AssistantOnboardingOutput> {
    this.ensureInitialized();
    const session = this.ensureOnboardingSession(input.userId);
    if (!input.confirmed) {
      return await this.continueOnboarding({ userId: input.userId, message: input.note?.trim() || '我还想调整一下' });
    }
    const nowIso = toIso(this.now());
    const summary = this.summarizeOnboarding(session);
    const profile: UserProfile = {
      ...summary.profile,
      updatedAt: nowIso,
      onboardingCompletedAt: nowIso
    };
    session.status = 'completed';
    session.completedAt = nowIso;
    session.updatedAt = nowIso;
    this.snapshot.profiles[input.userId] = profile;
    const reply = `好，我已经把你的工作画像记下来了。后面你直接像和助理聊天一样跟我说事就行，我会按“${profile.enabledCapabilityPackIds.map((id) => getCapabilityPackById(id)?.name ?? id).join('、')}”这些能力来接住。`;
    session.transcript.push({ role: 'assistant', content: reply, at: nowIso });
    this.appendEvidence(session.id, input.userId, 'onboarding_update', '初始化完成', summary.summary);
    await this.persist();
    return { session, reply, profile };
  }

  private ensureSession(input: AssistantChatInput, profile: UserProfile): ConversationSession {
    const sessionId = input.sessionId?.trim() || DEFAULT_SESSION_ID;
    const existing = this.snapshot.sessions[sessionId];
    const nowIso = toIso(this.now());
    if (existing) return existing;
    const session: ConversationSession = {
      id: sessionId,
      userId: input.userId,
      channel: input.channel,
      tenantId: input.tenantId,
      projectId: input.projectId,
      title: input.message.slice(0, 32) || '新会话',
      activeCapabilityPackIds: profile.enabledCapabilityPackIds,
      state: 'active',
      lastIntentKind: 'chat',
      lastRiskLevel: 'R0',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastTurnAt: nowIso
    };
    this.snapshot.sessions[sessionId] = session;
    return session;
  }

  private pendingApprovalForSession(sessionId: string): ApprovalCheckpoint | undefined {
    return Object.values(this.snapshot.approvals).find((item) => item.sessionId === sessionId && item.status === 'pending');
  }

  private async buildAgentReply(profile: UserProfile, session: ConversationSession, intent: ExecutionIntent, message: string): Promise<string> {
    const recentTurns = (this.snapshot.transcriptsBySessionId[session.id] ?? [])
      .slice(-8)
      .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
      .join('\n');
    if (!this.agentRuntime) {
      if (intent.kind === 'formal_plan') {
        return `我理解你的目标是：${intent.goal}\n\n建议先按这三个步骤推进：\n1. 明确边界和产出。\n2. 拆成可执行子任务。\n3. 做验证并回传证据。`;
      }
      if (intent.kind === 'analysis') {
        return `我先按分析任务来处理：会优先明确口径、结论和后续动作。你如果有额外数据范围，也可以直接补给我。`;
      }
      return `我明白你的意思了。接下来我会按你的工作画像和当前能力包来接这个任务，必要时我会先跟你确认边界。`;
    }
    const reply = await this.agentRuntime.ask({
      channel: session.channel,
      tenantId: session.tenantId,
      projectId: session.projectId,
      conversationId: session.id,
      userId: profile.userId,
      userName: profile.displayName,
      text: message,
      context: {
        profileSummary: buildProfileSummary(profile),
        capabilityPackInstructions: buildCapabilityInstruction(session.activeCapabilityPackIds),
        approvalPolicy: buildApprovalPolicyText(profile),
        recentConversation: recentTurns,
        extraGuidance: [
          `当前意图：${intent.kind}`,
          `当前风险等级：${intent.riskLevel}`,
          '如果用户只是闲聊，请自然接话；如果是工作诉求，先理解再执行。',
          '没有证据的动作不要假装成功。'
        ]
      }
    });
    return reply.text;
  }

  async chat(input: AssistantChatInput): Promise<AssistantChatOutput> {
    this.ensureInitialized();
    const profile = this.snapshot.profiles[input.userId];
    if (!profile) {
      const session: ConversationSession = {
        id: input.sessionId?.trim() || DEFAULT_SESSION_ID,
        userId: input.userId,
        channel: input.channel,
        tenantId: input.tenantId,
        projectId: input.projectId,
        title: '初始化会话',
        activeCapabilityPackIds: ['general-office'],
        state: 'active',
        lastIntentKind: 'chat',
        lastRiskLevel: 'R0',
        createdAt: toIso(this.now()),
        updatedAt: toIso(this.now()),
        lastTurnAt: toIso(this.now())
      };
      return {
        session,
        intent: {
          id: this.makeId('intent'),
          sessionId: session.id,
          userId: input.userId,
          sourceMessage: input.message,
          kind: 'chat',
          riskLevel: 'R0',
          goal: '完成初始化',
          constraints: [],
          expectedOutput: '用户画像',
          createdAt: toIso(this.now())
        },
        reply: '你还没完成初始化，我先不会盲目接任务。先让我了解一下你的工作画像。',
        evidence: [],
        onboardingRequired: true
      };
    }

    const session = this.ensureSession(input, profile);
    const pendingApproval = this.pendingApprovalForSession(session.id);
    if (pendingApproval) {
      return {
        session,
        intent: {
          id: this.makeId('intent'),
          sessionId: session.id,
          userId: input.userId,
          sourceMessage: input.message,
          kind: 'approval',
          riskLevel: pendingApproval.riskLevel,
          goal: pendingApproval.requestedAction,
          constraints: [pendingApproval.reason],
          expectedOutput: '审批结果',
          createdAt: toIso(this.now())
        },
        reply: `你这边还有一个待确认动作：${pendingApproval.requestedAction}。如果同意，直接回“确认”或走审批接口；如果不同意，告诉我改哪里。`,
        pendingApproval,
        evidence: [],
        onboardingRequired: false
      };
    }

    const riskLevel = detectRiskLevel(input.message);
    const intentKind = detectIntentKind(input.message);
    const intent: ExecutionIntent = {
      id: this.makeId('intent'),
      sessionId: session.id,
      userId: input.userId,
      sourceMessage: input.message,
      kind: intentKind,
      riskLevel,
      goal: input.message,
      constraints: [buildApprovalPolicyText(profile)],
      expectedOutput: intentKind === 'formal_plan' ? '结构化方案' : '自然语言回复',
      createdAt: toIso(this.now())
    };

    session.lastIntentKind = intent.kind;
    session.lastRiskLevel = intent.riskLevel;
    session.lastTurnAt = toIso(this.now());
    session.updatedAt = session.lastTurnAt;
    this.appendTranscript(session.id, 'user', input.message);
    const evidence: ExecutionEvidence[] = [];
    evidence.push(this.appendEvidence(session.id, input.userId, 'user_message', '收到用户消息', input.message));
    evidence.push(this.appendEvidence(session.id, input.userId, 'routing', `路由为 ${intent.kind}`, undefined, { riskLevel: intent.riskLevel }));

    if (intent.riskLevel === 'R3') {
      const checkpoint: ApprovalCheckpoint = {
        id: this.makeId('apc'),
        sessionId: session.id,
        userId: input.userId,
        riskLevel: 'R3',
        requestedAction: input.message,
        reason: '该动作可能涉及外发、删除、生产写操作或高风险桌面执行。',
        status: 'pending',
        expiresAt: toIso(addHours(this.now(), APPROVAL_EXPIRE_HOURS)),
        createdAt: toIso(this.now()),
        updatedAt: toIso(this.now())
      };
      this.snapshot.approvals[checkpoint.id] = checkpoint;
      session.pendingApprovalId = checkpoint.id;
      session.state = 'awaiting_approval';
      const approvalEvidence = this.appendEvidence(session.id, input.userId, 'approval_requested', '命中高风险审批', checkpoint.reason, {
        approvalId: checkpoint.id,
        riskLevel: checkpoint.riskLevel
      });
      evidence.push(approvalEvidence);
      await this.persist();
      return {
        session,
        intent,
        reply: `这个动作我先不直接执行，因为它命中了高风险策略。\n\n待确认动作：${checkpoint.requestedAction}\n原因：${checkpoint.reason}\n\n如果你要继续，直接回“确认”，或者走审批接口。`,
        pendingApproval: checkpoint,
        evidence,
        onboardingRequired: false
      };
    }

    const reply = await this.buildAgentReply(profile, session, intent, input.message);
    this.appendTranscript(session.id, 'assistant', reply);
    evidence.push(this.appendEvidence(session.id, input.userId, 'assistant_reply', '生成助手回复', reply.slice(0, 240), { intent: intent.kind }));
    await this.persist();
    return {
      session,
      intent,
      reply,
      evidence,
      onboardingRequired: false
    };
  }

  async approveSession(sessionId: string, input: AssistantSessionApprovalInput): Promise<AssistantSessionApprovalOutput> {
    this.ensureInitialized();
    const session = this.snapshot.sessions[sessionId];
    if (!session) throw new AssistantServiceError(404, 'SESSION_NOT_FOUND', `未找到会话：${sessionId}`);
    const checkpoint = session.pendingApprovalId ? this.snapshot.approvals[session.pendingApprovalId] : undefined;
    if (!checkpoint || checkpoint.status !== 'pending') {
      throw new AssistantServiceError(409, 'APPROVAL_NOT_PENDING', '当前会话没有待处理的审批节点。');
    }
    checkpoint.status = input.action === 'approve' ? 'approved' : 'rejected';
    checkpoint.updatedAt = toIso(this.now());
    checkpoint.resolvedAt = checkpoint.updatedAt;
    checkpoint.resolvedBy = input.actorName?.trim() || input.actorId;
    checkpoint.comment = input.comment?.trim();
    session.pendingApprovalId = undefined;
    session.state = 'active';
    const evidence = [
      this.appendEvidence(session.id, checkpoint.userId, 'approval_resolved', `审批已${input.action === 'approve' ? '通过' : '拒绝'}`, input.comment, {
        approvalId: checkpoint.id,
        actorId: input.actorId
      })
    ];
    const profile = this.snapshot.profiles[checkpoint.userId] ?? defaultProfile(checkpoint.userId, checkpoint.userId, toIso(this.now()));
    const reply =
      input.action === 'approve'
        ? await this.buildAgentReply(
            profile,
            session,
            {
              id: this.makeId('intent'),
              sessionId: session.id,
              userId: checkpoint.userId,
              sourceMessage: checkpoint.requestedAction,
              kind: 'automation',
              riskLevel: checkpoint.riskLevel,
              goal: checkpoint.requestedAction,
              constraints: ['用户已明确批准执行'],
              expectedOutput: '批准后执行说明',
              createdAt: toIso(this.now())
            },
            `用户已明确批准执行：${checkpoint.requestedAction}`
          )
        : '好，这个高风险动作我先停在这里，不会继续执行。你如果想换一种更稳的做法，直接告诉我。';
    this.appendTranscript(session.id, 'assistant', reply);
    evidence.push(this.appendEvidence(session.id, checkpoint.userId, 'assistant_reply', '审批后回复', reply.slice(0, 240)));
    await this.persist();
    return { session, checkpoint, reply, evidence };
  }

  getSessionEvidence(sessionId: string): ExecutionEvidence[] {
    this.ensureInitialized();
    return (this.snapshot.evidencesBySessionId[sessionId] ?? []).slice().sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }
}
