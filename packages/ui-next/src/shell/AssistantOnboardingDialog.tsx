import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { PromptInput } from '../primitives/PromptInput';
import styles from './AssistantOnboardingDialog.module.css';

type AssistantIntent = Extract<
  UIIntent,
  | { type: 'CHAT_DRAFT_SET'; id: string; text: string }
  | { type: 'CHAT_MESSAGE_SUBMIT'; id: string; text: string }
  | { type: 'ASSISTANT_ONBOARDING_CLOSE' }
>;

export type AssistantOnboardingDialogProps = {
  assistant: AppViewModel['assistant'];
  chat: AppViewModel['chat'];
  dispatch: (intent: AssistantIntent) => void;
};

export function AssistantOnboardingDialog(props: AssistantOnboardingDialogProps) {
  const activeId = props.chat.activeSessionId;
  const draft = props.chat.draftBySession[activeId] ?? '';
  const messages = props.chat.messagesBySession[activeId] ?? [];
  const sessionMeta = props.assistant.sessionMetaById[activeId];
  const isBusy = Boolean(sessionMeta?.isBusy);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="初始化本地助理">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>SpecWave Local Assistant</div>
            <h2 className={styles.title}>{props.assistant.onboarding.title}</h2>
            <p className={styles.subtitle}>{props.assistant.onboarding.subtitle}</p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={() => props.dispatch({ type: 'ASSISTANT_ONBOARDING_CLOSE' })}
            aria-label="关闭初始化对话"
          >
            稍后
          </button>
        </div>

        {props.assistant.onboarding.recommendedCapabilityPackIds.length > 0 && (
          <div className={styles.packRow}>
            {props.assistant.onboarding.recommendedCapabilityPackIds.map((id) => (
              <span key={id} className={styles.packChip}>
                {id}
              </span>
            ))}
          </div>
        )}

        {props.assistant.onboarding.summary && (
          <div className={styles.summaryCard}>
            <div className={styles.summaryTitle}>当前理解</div>
            <div className={styles.summaryText}>{props.assistant.onboarding.summary}</div>
          </div>
        )}

        {props.assistant.onboarding.error && <div className={styles.error}>{props.assistant.onboarding.error}</div>}

        <div className={styles.messages}>
          {messages.map((item, index) => (
            <div
              key={`${item.who}-${index}`}
              className={`${styles.message} ${item.who === '你' ? styles.userMessage : styles.aiMessage}`}
            >
              <div className={styles.messageWho}>{item.who}</div>
              <div className={styles.messageText}>{item.text}</div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <div className={styles.statusLine}>
            {isBusy ? '我正在整理你的画像...' : '直接用自然语言回答就行，模糊也没关系。'}
          </div>
          <PromptInput
            ariaLabel="初始化对话输入"
            placeholder="比如：我是开发负责人，平时要写方案、改代码、跑测试。"
            value={draft}
            onChangeText={(text) => props.dispatch({ type: 'CHAT_DRAFT_SET', id: activeId, text })}
            onSubmit={(text) => props.dispatch({ type: 'CHAT_MESSAGE_SUBMIT', id: activeId, text })}
          />
        </div>
      </div>
    </div>
  );
}
