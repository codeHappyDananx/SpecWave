import type { AppViewModel, ChatMessageVM, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';

type AssistantIntent = Extract<
  UIIntent,
  | { type: 'CHAT_MESSAGE_SUBMIT'; id: string; text: string }
  | { type: 'ASSISTANT_ONBOARDING_OPEN' }
  | { type: 'ASSISTANT_ONBOARDING_CLOSE' }
>;

const ASSISTANT_SESSION_ID = 'assistant-main';
const ONBOARDING_TITLE = '初始化本地助理';
const ONBOARDING_SUBTITLE = '先让我了解你的工作方式，这样后面我才能更像你的本地助理。';

function msg(who: ChatMessageVM['who'], text: string): ChatMessageVM {
  return { who, text };
}

function isConfirmText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return ['确认', '同意', '继续', '可以', '开始', 'approve', 'yes'].includes(normalized);
}

function isRejectText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return ['拒绝', '不用了', '取消', '不执行', 'reject', 'no'].includes(normalized);
}

function appendMessages(vm: AppViewModel, sessionId: string, items: ChatMessageVM[]): AppViewModel['chat'] {
  const sessionIds = vm.chat.sessionIds.includes(sessionId) ? vm.chat.sessionIds : [...vm.chat.sessionIds, sessionId];
  const current = vm.chat.messagesBySession[sessionId] ?? [];
  return {
    ...vm.chat,
    sessionIds,
    activeSessionId: sessionId,
    messagesBySession: {
      ...vm.chat.messagesBySession,
      [sessionId]: [...current, ...items]
    },
    draftBySession: {
      ...vm.chat.draftBySession,
      [sessionId]: ''
    }
  };
}

function mergeSessionMeta(vm: AppViewModel, sessionId: string, patch: Partial<AppViewModel['assistant']['sessionMetaById'][string]>) {
  const current = vm.assistant.sessionMetaById[sessionId] ?? {
    isBusy: false,
    pendingApprovalId: null,
    pendingApprovalReason: null,
    lastRiskLevel: null
  };
  return {
    ...vm.assistant,
    sessionMetaById: {
      ...vm.assistant.sessionMetaById,
      [sessionId]: {
        ...current,
        ...patch
      }
    }
  };
}

function buildOnboardingState(vm: AppViewModel, output: { session: { id: string; status: AppViewModel['assistant']['onboarding']['status']; summary: string; recommendedCapabilityPackIds: string[] }; profile?: AppViewModel['assistant']['profile'] }) {
  return {
    ...vm.assistant.onboarding,
    isOpen: !output.profile,
    status: output.profile ? 'completed' : output.session.status,
    sessionId: output.session.id,
    title: ONBOARDING_TITLE,
    subtitle: output.profile ? '初始化完成，后面你直接像聊天一样交代事情就行。' : ONBOARDING_SUBTITLE,
    summary: output.session.summary || null,
    error: null,
    recommendedCapabilityPackIds: output.session.recommendedCapabilityPackIds as AppViewModel['assistant']['onboarding']['recommendedCapabilityPackIds']
  };
}

function applyAssistantError(ctx: StoreCtx, sessionId: string, message: string, onboarding: boolean) {
  ctx.set((state) => {
    const vm = state.vm;
    const chat = appendMessages(vm, sessionId, [msg('AI', `这次没连通本地助理：${message}`)]);
    return {
      vm: {
        ...vm,
        rightMode: 'chat',
        chat,
        assistant: {
          ...mergeSessionMeta(vm, sessionId, { isBusy: false }),
          onboarding: onboarding ? { ...vm.assistant.onboarding, status: 'error', error: message } : vm.assistant.onboarding
        }
      }
    };
  });
}

export function handleAssistantChatIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;
  const assistantIntent = intent as AssistantIntent;

  if (assistantIntent.type === 'ASSISTANT_ONBOARDING_OPEN') {
    return {
      vm: {
        ...vm,
        rightMode: 'chat',
        assistant: {
          ...vm.assistant,
          onboarding: { ...vm.assistant.onboarding, isOpen: true, error: null }
        }
      }
    };
  }
  if (assistantIntent.type === 'ASSISTANT_ONBOARDING_CLOSE') {
    return { vm: { ...vm, assistant: { ...vm.assistant, onboarding: { ...vm.assistant.onboarding, isOpen: false } } } };
  }
  if (assistantIntent.type !== 'CHAT_MESSAGE_SUBMIT') return null;

  const api = window.specwave;
  const sessionId = assistantIntent.id || ASSISTANT_SESSION_ID;
  const userText = assistantIntent.text.trim();
  if (!userText) return null;

  void (async () => {
    if (!api?.assistantChat) {
      applyAssistantError(ctx, sessionId, 'preload 未注入 assistant API。', vm.assistant.onboarding.isOpen);
      return;
    }

    const latestVm = ctx.get().vm;
    const pendingMeta = latestVm.assistant.sessionMetaById[sessionId];

    if (latestVm.assistant.onboarding.isOpen) {
      const result = latestVm.assistant.onboarding.status === 'awaiting_confirmation' && isConfirmText(userText)
        ? await api.assistantOnboardingFinish({ confirmed: true })
        : await api.assistantOnboardingContinue(userText);
      if (!result.ok) {
        applyAssistantError(ctx, sessionId, result.error, true);
        return;
      }
      ctx.set((state2) => {
        const vm2 = state2.vm;
        const chat = appendMessages(vm2, sessionId, [msg('AI', result.data.reply)]);
        return {
          vm: {
            ...vm2,
            rightMode: 'chat',
            chat,
            assistant: {
              ...mergeSessionMeta(vm2, sessionId, { isBusy: false }),
              profile: result.data.profile ?? vm2.assistant.profile,
              capabilityPacks: vm2.assistant.capabilityPacks,
              onboarding: buildOnboardingState(vm2, result.data)
            }
          }
        };
      });
      return;
    }

    if (pendingMeta?.pendingApprovalId && (isConfirmText(userText) || isRejectText(userText))) {
      const result = await api.assistantApprove({
        sessionId,
        action: isRejectText(userText) ? 'reject' : 'approve',
        comment: isRejectText(userText) ? userText : undefined
      });
      if (!result.ok) {
        applyAssistantError(ctx, sessionId, result.error, false);
        return;
      }
      ctx.set((state2) => {
        const vm2 = state2.vm;
        const chat = appendMessages(vm2, sessionId, [msg('AI', result.data.reply)]);
        return {
          vm: {
            ...vm2,
            rightMode: 'chat',
            chat,
            assistant: mergeSessionMeta(vm2, sessionId, {
              isBusy: false,
              pendingApprovalId: null,
              pendingApprovalReason: null
            })
          }
        };
      });
      return;
    }

    const result = await api.assistantChat({ sessionId, message: userText, channel: 'desktop', tenantId: 'local', projectId: 'local' });
    if (!result.ok) {
      applyAssistantError(ctx, sessionId, result.error, false);
      return;
    }
    if (result.data.onboardingRequired) {
      const start = await api.assistantOnboardingStart();
      if (!start.ok) {
        applyAssistantError(ctx, sessionId, start.error, true);
        return;
      }
      ctx.set((state2) => {
        const vm2 = state2.vm;
        const chat = appendMessages(vm2, sessionId, [msg('AI', start.data.reply)]);
        return {
          vm: {
            ...vm2,
            rightMode: 'chat',
            chat,
            assistant: {
              ...mergeSessionMeta(vm2, sessionId, { isBusy: false }),
              onboarding: buildOnboardingState(vm2, start.data)
            }
          }
        };
      });
      return;
    }

    ctx.set((state2) => {
      const vm2 = state2.vm;
      const chat = appendMessages(vm2, sessionId, [msg('AI', result.data.reply)]);
      return {
        vm: {
          ...vm2,
          rightMode: 'chat',
          chat,
          assistant: mergeSessionMeta(vm2, sessionId, {
            isBusy: false,
            pendingApprovalId: result.data.pendingApproval?.id ?? null,
            pendingApprovalReason: result.data.pendingApproval?.reason ?? null,
            lastRiskLevel: result.data.intent.riskLevel
          })
        }
      };
    });
  })();

  return {
    vm: {
      ...vm,
      rightMode: 'chat',
      chat: appendMessages(vm, sessionId, [msg('你', userText)]),
      assistant: mergeSessionMeta(vm, sessionId, { isBusy: true })
    }
  };
}
