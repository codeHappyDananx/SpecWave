import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { PromptInput } from '../../primitives/PromptInput';
import styles from './TerminalView.module.css';

type TerminalIntent = Extract<UIIntent, { type: 'TERMINAL_COMMAND_SUBMIT' }>;

export type TerminalViewProps = {
  terminal: AppViewModel['terminal'];
  dispatch: (intent: TerminalIntent) => void;
};

export function TerminalView(props: TerminalViewProps) {
  const activeId = props.terminal.activePanelId;
  const lines = props.terminal.outputByPanel[activeId] ?? [];

  if (props.terminal.panelIds.length === 0) {
    return (
      <div className={styles.root} aria-label="终端空态">
        <div className={styles.emptyHint} aria-label="终端提示">
          <div>还没有终端面板</div>
          <div className={styles.emptyHintMuted}>点击右上角 “+” 新建一个终端</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} aria-label="终端面板">
      <div className={styles.termBox} aria-label="终端输出">
        {lines.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      <PromptInput
        ariaLabel="终端输入"
        placeholder="输入命令…"
        onSubmit={(command) => props.dispatch({ type: 'TERMINAL_COMMAND_SUBMIT', command })}
      />
    </div>
  );
}
