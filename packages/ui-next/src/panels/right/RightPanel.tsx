import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { ChatView } from './ChatView';
import { TerminalView } from './TerminalView';
import { ClosableTab } from '../../primitives/ClosableTab';
import { Icon } from '../../primitives/Icons';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import styles from './RightPanel.module.css';

type RightIntent = Extract<
  UIIntent,
  | { type: 'RIGHT_MODE_SET' }
  | { type: 'RIGHT_PANEL_ADD' }
  | { type: 'TERMINAL_PANEL_SET_ACTIVE' }
  | { type: 'TERMINAL_PANEL_CLOSE' }
  | { type: 'CHAT_SESSION_SET_ACTIVE' }
  | { type: 'CHAT_SESSION_CLOSE' }
  | { type: 'TERMINAL_COMMAND_SUBMIT' }
  | { type: 'CHAT_DRAFT_SET' }
  | { type: 'CHAT_MESSAGE_SUBMIT' }
>;

export type RightPanelProps = {
  rightMode: AppViewModel['rightMode'];
  terminal: AppViewModel['terminal'];
  chat: AppViewModel['chat'];
  dispatch: (intent: RightIntent) => void;
  minwPx: number;
};

export function RightPanel(props: RightPanelProps) {
  const headerTabs =
    props.rightMode === 'terminal' ? (
      <div className={styles.headerTabs} role="tablist" aria-label="终端页签">
        {props.terminal.panelIds.map((id, idx) => (
          <ClosableTab
            key={id}
            selected={id === props.terminal.activePanelId}
            title={`PS${idx + 1}`}
            onSelect={() => props.dispatch({ type: 'TERMINAL_PANEL_SET_ACTIVE', id })}
            onClose={() => props.dispatch({ type: 'TERMINAL_PANEL_CLOSE', id })}
          />
        ))}
      </div>
    ) : (
      <div className={styles.headerTabs} role="tablist" aria-label="对话会话">
        {props.chat.sessionIds.map((id, idx) => (
          <ClosableTab
            key={id}
            selected={id === props.chat.activeSessionId}
            title={`AI${idx + 1}`}
            onSelect={() => props.dispatch({ type: 'CHAT_SESSION_SET_ACTIVE', id })}
            onClose={() => props.dispatch({ type: 'CHAT_SESSION_CLOSE', id })}
          />
        ))}
      </div>
    );

  return (
    <Panel
      as="aside"
      ariaLabel="右区"
      headerAriaLabel="右区头部"
      bodyAriaLabel="右区滚动区"
      minwPx={props.minwPx}
      header={
        <>
          <div className={styles.headerLeft} aria-label="右区切换区">
            <div className={styles.modeTabs} role="tablist" aria-label="终端/对话切换">
              <button
                className={styles.modeTab}
                type="button"
                role="tab"
                aria-selected={props.rightMode === 'terminal'}
                onClick={() => props.dispatch({ type: 'RIGHT_MODE_SET', mode: 'terminal' })}
                title="终端"
              >
                <Icon name="terminal" />
              </button>
              <button
                className={styles.modeTab}
                type="button"
                role="tab"
                aria-selected={props.rightMode === 'chat'}
                onClick={() => props.dispatch({ type: 'RIGHT_MODE_SET', mode: 'chat' })}
                title="对话"
              >
                <Icon name="chat" />
              </button>
            </div>
          </div>
          <div className={styles.headerMid} aria-label="右区页签区">
            {headerTabs}
          </div>
          <IconButton
            className={styles.headerAdd}
            active
            title="新增"
            ariaLabel="新增面板"
            icon={<Icon name="plus" />}
            onClick={() => props.dispatch({ type: 'RIGHT_PANEL_ADD' })}
          />
        </>
      }
    >
      {props.rightMode === 'terminal' ? (
        <TerminalView terminal={props.terminal} dispatch={props.dispatch} />
      ) : (
        <ChatView chat={props.chat} dispatch={props.dispatch} />
      )}
    </Panel>
  );
}

