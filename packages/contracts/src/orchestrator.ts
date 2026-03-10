export type OrchestratorRiskLevel = 'R0' | 'R1' | 'R2' | 'R3';

export type OrchestratorRequestState =
  | 'INTAKE'
  | 'CLARIFY'
  | 'SPEC_FREEZE'
  | 'PLAN_COMMIT'
  | 'WAITING_APPROVAL'
  | 'BUILD_RUN'
  | 'TEST_RUN'
  | 'DELIVERY_DRAFT'
  | 'ACCEPTANCE_PENDING'
  | 'REMINDER_L1'
  | 'REMINDER_L2'
  | 'ESCALATION_L3'
  | 'PAUSED_BY_NO_RESPONSE'
  | 'REWORK'
  | 'DONE'
  | 'FAILED';

export type OrchestratorApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';

export type OrchestratorRunState = 'pending' | 'running' | 'paused' | 'resumed' | 'succeeded' | 'failed';

export type OrchestratorEventType =
  | 'RequestCreated'
  | 'ClarificationClosed'
  | 'SpecFrozen'
  | 'PlanCommitted'
  | 'ApprovalRequested'
  | 'ApprovalResolved'
  | 'RunStarted'
  | 'RunPaused'
  | 'RunResumed'
  | 'RunCompleted'
  | 'TestEvaluated'
  | 'DeliveryReady'
  | 'AcceptanceUpdated'
  | 'ReminderSent'
  | 'Escalated'
  | 'PausedByNoResponse';

export type OrchestratorActorType = 'system' | 'agent' | 'client' | 'operator';

export type OrchestratorActor = {
  type: OrchestratorActorType;
  id: string;
  displayName?: string;
};

export type OrchestratorEvent = {
  id: string;
  requestId: string;
  type: OrchestratorEventType;
  at: string;
  summary: string;
  actor: OrchestratorActor;
  meta?: Record<string, string | number | boolean | null>;
};

export type OrchestratorProject = {
  id: string;
  tenantId: string;
  name: string;
  owner: string;
  repoRef?: string | null;
  policyProfile: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type OrchestratorRequest = {
  id: string;
  tenantId: string;
  projectId: string;
  sourceChannel: string;
  requesterId: string;
  intent: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel: OrchestratorRiskLevel;
  state: OrchestratorRequestState;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  autoProgressEnabled: boolean;
  latestSpecId?: string;
  latestPlanId?: string;
  latestDeliveryId?: string;
  acceptanceTimeline?: {
    acceptanceStartedAt: string;
    l1DueAt: string;
    l2DueAt: string;
    l3DueAt: string;
    pauseDueAt: string;
  };
};

export type OrchestratorSpec = {
  id: string;
  requestId: string;
  version: number;
  summary: string;
  requirements: string[];
  acceptanceCriteria: string[];
  frozenAt: string;
};

export type OrchestratorTask = {
  id: string;
  planId: string;
  requestId: string;
  title: string;
  type: 'analysis' | 'implementation' | 'test' | 'delivery';
  assignedAgent: 'claude' | 'codex' | 'system';
  dependsOnTaskIds: string[];
  state: 'pending' | 'running' | 'succeeded' | 'failed';
  retries: number;
};

export type OrchestratorPlan = {
  id: string;
  requestId: string;
  specId: string;
  version: number;
  agentStrategy: string;
  riskLevel: OrchestratorRiskLevel;
  state: 'draft' | 'committed' | 'running' | 'done' | 'failed';
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type OrchestratorApproval = {
  id: string;
  requestId: string;
  scope: 'request' | 'task' | 'run';
  reason: string;
  requiredRole: string;
  decision: OrchestratorApprovalDecision;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrchestratorRun = {
  id: string;
  requestId: string;
  taskId: string;
  executor: string;
  stage: 'build' | 'test' | 'orchestration';
  attempt: number;
  checkpointUri?: string;
  state: OrchestratorRunState;
  exitCode?: number | null;
  startedAt: string;
  endedAt?: string;
};

export type OrchestratorTestReport = {
  id: string;
  requestId: string;
  runId: string;
  suite: string;
  passRate: number;
  failedCases: string[];
  verdict: 'pass' | 'fail' | 'flaky';
  createdAt: string;
};

export type OrchestratorDelivery = {
  id: string;
  requestId: string;
  version: number;
  artifactUri: string;
  demoLink: string;
  releaseState: 'draft' | 'ready' | 'accepted' | 'rejected';
  resultCard: {
    title: string;
    summary: string;
    businessChecks: Array<{ name: string; status: 'pass' | 'fail'; detail: string }>;
    risks: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type OrchestratorCreateRequestInput = {
  tenantId: string;
  projectId: string;
  sourceChannel: string;
  requesterId: string;
  requesterName?: string;
  intent: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel?: OrchestratorRiskLevel;
  correlationId?: string;
  idempotencyKey: string;
};

export type OrchestratorCreateRequestOutput = {
  requestId: string;
  state: OrchestratorRequestState;
  acceptanceRequired: boolean;
  pendingApprovalId?: string;
};

export type OrchestratorRequestDetail = {
  request: OrchestratorRequest;
  spec?: OrchestratorSpec;
  plan?: OrchestratorPlan;
  tasks: OrchestratorTask[];
  runs: OrchestratorRun[];
  testReports: OrchestratorTestReport[];
  delivery?: OrchestratorDelivery;
  notifications: OrchestratorNotification[];
  pendingApprovals: OrchestratorApproval[];
  events: OrchestratorEvent[];
};

export type OrchestratorAcceptanceInput = {
  action: 'approve' | 'reject';
  actorId: string;
  actorName?: string;
  comment?: string;
};

export type OrchestratorApprovalInput = {
  approvalId: string;
  decision: 'approved' | 'rejected';
  actorId: string;
  actorName?: string;
  comment?: string;
};

export type OrchestratorRunResumeInput = {
  actorId: string;
  actorName?: string;
  reason?: string;
};

export type OrchestratorNotificationChannel =
  | 'webchat'
  | 'dingtalk'
  | 'wecom'
  | 'telegram'
  | 'email'
  | 'internal';

export type OrchestratorNotificationKind =
  | 'delivery_ready'
  | 'acceptance_reminder_l1'
  | 'acceptance_reminder_l2'
  | 'acceptance_escalated'
  | 'paused_no_response'
  | 'approval_required'
  | 'approval_expired';

export type OrchestratorNotificationStatus = 'pending' | 'sent' | 'failed' | 'acked';

export type OrchestratorNotification = {
  id: string;
  requestId: string;
  channel: OrchestratorNotificationChannel;
  kind: OrchestratorNotificationKind;
  title: string;
  body: string;
  status: OrchestratorNotificationStatus;
  toUserId: string;
  toUserName?: string;
  dedupeKey: string;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  ackedAt?: string;
};

export type OrchestratorWebhookPayload = {
  externalChatId: string;
  threadId?: string;
  userId: string;
  userName?: string;
  message: string;
  tenantId: string;
  projectId: string;
  idempotencyKey: string;
  riskLevel?: OrchestratorRiskLevel;
};

export type OrchestratorDingTalkWebhookPayload = {
  conversationId: string;
  msgId: string;
  senderUserId: string;
  senderNick?: string;
  text: { content: string };
  tenantId: string;
  projectId: string;
  riskLevel?: OrchestratorRiskLevel;
};

export type OrchestratorDingTalkAppbotPayload = {
  conversationId: string;
  msgId: string;
  conversationType?: string;
  senderStaffId?: string;
  senderId?: string;
  senderUnionId?: string;
  senderNick?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  isInAtList?: boolean;
  atUsers?: Array<{
    staffId?: string;
    dingtalkId?: string;
    unionId?: string;
  }>;
  msgtype?: string;
  text?: {
    content?: string;
  };
  content?: {
    downloadCode?: string;
    fileName?: string;
    duration?: number;
    recognition?: string;
    videoType?: string;
    richText?: Array<{
      type?: string;
      text?: string;
      downloadCode?: string;
    }>;
  };
  robotCode?: string;
};

export type OrchestratorWecomWebhookPayload = {
  conversationId: string;
  msgid: string;
  from: string;
  fromName?: string;
  content: string;
  tenantId: string;
  projectId: string;
  riskLevel?: OrchestratorRiskLevel;
};

export type OrchestratorTelegramWebhookPayload = {
  update_id: number;
  message: {
    message_id: number;
    chat: { id: number | string };
    from?: {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
  };
  tenantId: string;
  projectId: string;
  riskLevel?: OrchestratorRiskLevel;
};

export type OrchestratorResultCardOutput = {
  deliveryId: string;
  requestId: string;
  version: number;
  title: string;
  summary: string;
  businessChecks: Array<{ name: string; status: 'pass' | 'fail'; detail: string }>;
  risks: string[];
};

export type OrchestratorDemoLinkOutput = {
  deliveryId: string;
  requestId: string;
  demoLink: string;
  expiresAt: string;
};

export type OrchestratorMetricsSummary = {
  generatedAt: string;
  totalRequests: number;
  stateCount: Record<OrchestratorRequestState, number>;
  doneCount: number;
  pausedCount: number;
  acceptancePendingCount: number;
  reminderCount: number;
  escalationCount: number;
  avgDeliveryHours: number;
  notificationPendingCount: number;
  notificationFailedCount: number;
};

export type CapabilityPackId =
  | 'general-office'
  | 'software-dev'
  | 'finance-analysis'
  | 'product-requirement'
  | 'research-consulting'
  | 'desktop-execution';

export type CapabilityPackManifest = {
  id: CapabilityPackId;
  name: string;
  description: string;
  defaultTools: string[];
  exampleRequests: string[];
  defaultPrompt: string;
  outputTemplate: string;
  acceptanceTemplate: string;
  riskHints: string[];
};

export type AssistantApprovalPolicy = {
  autoApproveUpTo: OrchestratorRiskLevel;
  notes: string[];
};

export type UserProfile = {
  userId: string;
  displayName: string;
  roleTitle: string;
  industry: string;
  workGoals: string[];
  commonDeliverables: string[];
  communicationStyle: 'natural' | 'hybrid' | 'formal';
  riskPreference: 'cautious' | 'balanced' | 'aggressive';
  commonProjects: string[];
  commonTools: string[];
  dataSources: string[];
  enabledCapabilityPackIds: CapabilityPackId[];
  disabledCapabilityPackIds: CapabilityPackId[];
  approvalPolicy: AssistantApprovalPolicy;
  onboardingCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantOnboardingStepKey = 'role' | 'tasks' | 'tools' | 'automation' | 'confirm';
export type AssistantOnboardingStatus = 'idle' | 'active' | 'awaiting_confirmation' | 'completed';

export type AssistantOnboardingTranscriptTurn = {
  role: 'assistant' | 'user';
  content: string;
  at: string;
};

export type AssistantOnboardingSession = {
  id: string;
  userId: string;
  status: AssistantOnboardingStatus;
  currentStep: AssistantOnboardingStepKey;
  draftProfile: Partial<UserProfile> & {
    automationPreference?: string;
    freeformNotes?: string[];
  };
  recommendedCapabilityPackIds: CapabilityPackId[];
  summary: string;
  transcript: AssistantOnboardingTranscriptTurn[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type ConversationIntentKind = 'chat' | 'analysis' | 'automation' | 'formal_plan' | 'approval';

export type ExecutionIntent = {
  id: string;
  sessionId: string;
  userId: string;
  sourceMessage: string;
  kind: ConversationIntentKind;
  riskLevel: OrchestratorRiskLevel;
  goal: string;
  constraints: string[];
  expectedOutput: string;
  createdAt: string;
};

export type ExecutionEvidenceKind =
  | 'user_message'
  | 'routing'
  | 'assistant_reply'
  | 'approval_requested'
  | 'approval_resolved'
  | 'onboarding_update';

export type ExecutionEvidence = {
  id: string;
  sessionId: string;
  userId: string;
  kind: ExecutionEvidenceKind;
  summary: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
  artifactPath?: string;
  createdAt: string;
};

export type ApprovalCheckpointStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ApprovalCheckpoint = {
  id: string;
  sessionId: string;
  userId: string;
  riskLevel: OrchestratorRiskLevel;
  requestedAction: string;
  reason: string;
  status: ApprovalCheckpointStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  comment?: string;
};

export type ConversationSession = {
  id: string;
  userId: string;
  channel: string;
  tenantId: string;
  projectId: string;
  title: string;
  activeCapabilityPackIds: CapabilityPackId[];
  state: 'active' | 'awaiting_approval' | 'completed';
  lastIntentKind: ConversationIntentKind;
  lastRiskLevel: OrchestratorRiskLevel;
  pendingApprovalId?: string;
  createdAt: string;
  updatedAt: string;
  lastTurnAt: string;
};

export type AssistantOnboardingStartInput = {
  userId: string;
  userName?: string;
};

export type AssistantOnboardingContinueInput = {
  userId: string;
  message: string;
};

export type AssistantOnboardingFinishInput = {
  userId: string;
  confirmed: boolean;
  note?: string;
};

export type AssistantOnboardingOutput = {
  session: AssistantOnboardingSession;
  reply: string;
  profile?: UserProfile;
};

export type AssistantChatInput = {
  sessionId?: string;
  userId: string;
  userName?: string;
  channel: string;
  tenantId: string;
  projectId: string;
  message: string;
};

export type AssistantChatOutput = {
  session: ConversationSession;
  intent: ExecutionIntent;
  reply: string;
  pendingApproval?: ApprovalCheckpoint;
  evidence: ExecutionEvidence[];
  onboardingRequired: boolean;
};

export type AssistantSessionApprovalInput = {
  action: 'approve' | 'reject';
  actorId: string;
  actorName?: string;
  comment?: string;
};

export type AssistantSessionApprovalOutput = {
  session: ConversationSession;
  checkpoint: ApprovalCheckpoint;
  reply: string;
  evidence: ExecutionEvidence[];
};
