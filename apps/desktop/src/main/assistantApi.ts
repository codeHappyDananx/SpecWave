import os from 'node:os';
import type {
  AssistantChatOutput,
  AssistantOnboardingOutput,
  AssistantSessionApprovalOutput,
  CapabilityPackManifest,
  ExecutionEvidence,
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
  return requestJson<UserProfile | null>('/api/v1/profile/me');
}

export function assistantUpdateProfile(patch: Partial<UserProfile>) {
  return requestJson<UserProfile>('/api/v1/profile/me', { method: 'PUT', body: patch });
}

export function assistantListCapabilityPacks() {
  return requestJson<CapabilityPackManifest[]>('/api/v1/capability-packs');
}

export function assistantOnboardingStart() {
  return requestJson<AssistantOnboardingOutput>('/api/v1/onboarding/start', { method: 'POST', body: {} });
}

export function assistantOnboardingContinue(message: string) {
  return requestJson<AssistantOnboardingOutput>('/api/v1/onboarding/continue', {
    method: 'POST',
    body: { message }
  });
}

export function assistantOnboardingFinish(args: { confirmed: boolean; note?: string }) {
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
  return requestJson<AssistantSessionApprovalOutput>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/approve`, {
    method: 'POST',
    body: args
  });
}

export function assistantGetEvidence(sessionId: string) {
  return requestJson<ExecutionEvidence[]>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/evidence`);
}
