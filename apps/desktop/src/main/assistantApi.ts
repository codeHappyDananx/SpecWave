import os from 'node:os';
import type {
  AssistantChatOutput,
  AssistantOnboardingOutput,
  AssistantSessionApprovalOutput,
  CapabilityPackManifest,
  ConversationSession,
  ExecutionEvidence,
  ExecutionIntent,
  OrchestratorRiskLevel,
  ApprovalCheckpoint,
  UserProfile
} from '@specwave/contracts';

type AssistantApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

type JsonEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

function isAssistantTestMode() {
  return process.env.SPECWAVE_TEST_MODE === '1';
}

function nowIso() {
  return new Date().toISOString();
}

function buildTestProfile(): UserProfile {
  const now = nowIso();
  return {
    userId: 'local:test-user',
    displayName: '测试用户',
    roleTitle: '测试工程师',
    industry: 'software',
    workGoals: ['验证桌面端基础流程'],
    commonDeliverables: ['测试报告', '回归记录'],
    communicationStyle: 'natural',
    riskPreference: 'balanced',
    commonProjects: ['SpecWave 自动化验证'],
    commonTools: ['Playwright', 'Vitest'],
    dataSources: ['本地文件'],
    enabledCapabilityPackIds: ['software-dev'],
    disabledCapabilityPackIds: [],
    approvalPolicy: {
      autoApproveUpTo: 'R1',
      notes: ['测试模式下不访问外部编排服务。']
    },
    onboardingCompletedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function buildTestSession(): ConversationSession {
  const now = nowIso();
  return {
    id: 'session-test',
    userId: 'local:test-user',
    channel: 'desktop',
    tenantId: 'local',
    projectId: 'specwave-test',
    title: '测试会话',
    activeCapabilityPackIds: ['software-dev'],
    state: 'active',
    lastIntentKind: 'chat',
    lastRiskLevel: 'R0',
    createdAt: now,
    updatedAt: now,
    lastTurnAt: now
  };
}

function buildTestIntent(message: string): ExecutionIntent {
  const now = nowIso();
  return {
    id: 'intent-test',
    sessionId: 'session-test',
    userId: 'local:test-user',
    sourceMessage: message,
    kind: 'chat',
    riskLevel: 'R0',
    goal: '验证测试模式返回',
    constraints: ['不访问外部网络'],
    expectedOutput: '返回固定响应',
    createdAt: now
  };
}

function buildTestEvidence(message: string): ExecutionEvidence[] {
  const now = nowIso();
  return [
    {
      id: 'evidence-user-message',
      sessionId: 'session-test',
      userId: 'local:test-user',
      kind: 'user_message',
      summary: '测试模式收到消息',
      detail: message,
      createdAt: now
    }
  ];
}

function buildTestApproval(): ApprovalCheckpoint {
  const now = nowIso();
  return {
    id: 'approval-test',
    sessionId: 'session-test',
    userId: 'local:test-user',
    riskLevel: 'R0' satisfies OrchestratorRiskLevel,
    requestedAction: '测试模式无需审批',
    reason: '测试模式固定通过',
    status: 'approved',
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
    resolvedAt: now,
    resolvedBy: 'system:test'
  };
}

function getAssistantBaseUrl(): string {
  const env = process.env.SPECWAVE_ASSISTANT_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const port = process.env.SPECWAVE_ORCHESTRATOR_PORT?.trim() || '8787';
  return `http://127.0.0.1:${port}`;
}

function getDefaultHeaders(): Record<string, string> {
  const userName = os.userInfo().username || 'specwave-user';
  return {
    'Content-Type': 'application/json',
    'x-specwave-user-id': `local:${userName}`,
    'x-specwave-user-name': userName
  };
}

async function requestJson<T>(pathname: string, options: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown } = {}): Promise<AssistantApiResult<T>> {
  try {
    const response = await fetch(`${getAssistantBaseUrl()}${pathname}`, {
      method: options.method ?? 'GET',
      headers: getDefaultHeaders(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = (await response.json().catch(() => ({}))) as JsonEnvelope<T>;
    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        error: payload.error?.message || `请求失败（HTTP ${response.status}）`,
        code: payload.error?.code
      };
    }
    return { ok: true, data: (payload.data as T) ?? (payload as T) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function assistantGetProfile() {
  if (isAssistantTestMode()) return Promise.resolve({ ok: true as const, data: buildTestProfile() });
  return requestJson<UserProfile | null>('/api/v1/profile/me');
}

export function assistantUpdateProfile(patch: Partial<UserProfile>) {
  if (isAssistantTestMode()) {
    return Promise.resolve({
      ok: true as const,
      data: {
        ...buildTestProfile(),
        ...patch,
        updatedAt: nowIso()
      }
    });
  }
  return requestJson<UserProfile>('/api/v1/profile/me', { method: 'PUT', body: patch });
}

export function assistantListCapabilityPacks() {
  if (isAssistantTestMode()) return Promise.resolve({ ok: true as const, data: [] satisfies CapabilityPackManifest[] });
  return requestJson<CapabilityPackManifest[]>('/api/v1/capability-packs');
}

export function assistantOnboardingStart() {
  if (isAssistantTestMode()) {
    return Promise.resolve({
      ok: true as const,
      data: {
        session: {
          id: 'onboarding-test',
          userId: 'local:test-user',
          status: 'completed',
          currentStep: 'confirm',
          draftProfile: buildTestProfile(),
          recommendedCapabilityPackIds: ['software-dev'],
          summary: '测试模式已跳过 onboarding。',
          transcript: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          completedAt: nowIso()
        },
        reply: '测试模式已跳过 onboarding。',
        profile: buildTestProfile()
      } satisfies AssistantOnboardingOutput
    });
  }
  return requestJson<AssistantOnboardingOutput>('/api/v1/onboarding/start', { method: 'POST', body: {} });
}

export function assistantOnboardingContinue(message: string) {
  if (isAssistantTestMode()) return assistantOnboardingStart();
  return requestJson<AssistantOnboardingOutput>('/api/v1/onboarding/continue', {
    method: 'POST',
    body: { message }
  });
}

export function assistantOnboardingFinish(args: { confirmed: boolean; note?: string }) {
  if (isAssistantTestMode()) return assistantOnboardingStart();
  return requestJson<AssistantOnboardingOutput>('/api/v1/onboarding/finish', {
    method: 'POST',
    body: args
  });
}

export function assistantChat(args: {
  sessionId?: string;
  message: string;
  channel?: string;
  tenantId?: string;
  projectId?: string;
}) {
  if (isAssistantTestMode()) {
    return Promise.resolve({
      ok: true as const,
      data: {
        session: buildTestSession(),
        intent: buildTestIntent(args.message),
        reply: '测试模式：已收到消息。',
        evidence: buildTestEvidence(args.message),
        onboardingRequired: false
      } satisfies AssistantChatOutput
    });
  }
  return requestJson<AssistantChatOutput>('/api/v1/sessions/chat', {
    method: 'POST',
    body: {
      sessionId: args.sessionId,
      message: args.message,
      channel: args.channel ?? 'desktop',
      tenantId: args.tenantId ?? 'local',
      projectId: args.projectId ?? 'local'
    }
  });
}

export function assistantApprove(sessionId: string, args: { action: 'approve' | 'reject'; comment?: string }) {
  if (isAssistantTestMode()) {
    return Promise.resolve({
      ok: true as const,
      data: {
        session: buildTestSession(),
        checkpoint: buildTestApproval(),
        reply: `测试模式：${args.action === 'approve' ? '已批准' : '已拒绝'}。`,
        evidence: buildTestEvidence(args.comment ?? sessionId)
      } satisfies AssistantSessionApprovalOutput
    });
  }
  return requestJson<AssistantSessionApprovalOutput>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/approve`, {
    method: 'POST',
    body: args
  });
}

export function assistantGetEvidence(sessionId: string) {
  if (isAssistantTestMode()) return Promise.resolve({ ok: true as const, data: buildTestEvidence(sessionId) });
  return requestJson<ExecutionEvidence[]>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/evidence`);
}
