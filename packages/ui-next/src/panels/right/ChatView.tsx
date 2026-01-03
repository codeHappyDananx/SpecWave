import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { PromptInput } from '../../primitives/PromptInput';
import styles from './ChatView.module.css';

type ChatIntent = Extract<UIIntent, { type: 'CHAT_DRAFT_SET' } | { type: 'CHAT_MESSAGE_SUBMIT' }>;

export type ChatViewProps = {
  chat: AppViewModel['chat'];
  dispatch: (intent: ChatIntent) => void;
};

export function ChatView(props: ChatViewProps) {
  const activeId = props.chat.activeSessionId;
  const draft = props.chat.draftBySession[activeId] ?? '';
  const msgs = props.chat.messagesBySession[activeId] ?? [];

  return (
    <div className={styles.root} aria-label="对话面板">
      <div className={styles.msgs} aria-label="对话消息">
        {msgs.map((m, idx) => (
          <div key={idx} className={`${styles.msg} ${m.who === '你' ? styles.msgUser : styles.msgAi}`}>
            <div className={styles.who}>{m.who}</div>
            <div className={styles.text}>{m.text}</div>
          </div>
        ))}
      </div>

      <div className={styles.inputWrap} aria-label="对话输入区">
        <PromptInput
          ariaLabel="对话输入"
          placeholder="输入指令…"
          value={draft}
          onChangeText={(text) => props.dispatch({ type: 'CHAT_DRAFT_SET', id: activeId, text })}
          onSubmit={(text) => props.dispatch({ type: 'CHAT_MESSAGE_SUBMIT', id: activeId, text })}
        />
      </div>
    </div>
  );
}
