import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { ChatView } from './ChatView';
import { TerminalView } from './TerminalView';
import { ClosableTab } from '../../primitives/ClosableTab';
import { Icon } from '../../primitives/Icons';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import type { SubscribeTerminalEvent } from '../../shell/ports';
import styles from './RightPanel.module.css';

type RightIntent = Extract<
  UIIntent,
  | { type: 'RIGHT_MODE_SET' }
  | { type: 'RIGHT_PANEL_ADD' }
  | { type: 'TERMINAL_PANEL_SET_ACTIVE' }
  | { type: 'TERMINAL_PANEL_CLOSE' }
  | { type: 'TERMINAL_COPY' }
  | { type: 'TERMINAL_PASTE' }
  | { type: 'CHAT_SESSION_SET_ACTIVE' }
  | { type: 'CHAT_SESSION_CLOSE' }
  | { type: 'TERMINAL_WRITE' }
  | { type: 'TERMINAL_RESIZE' }
  | { type: 'CHAT_DRAFT_SET' }
  | { type: 'CHAT_MESSAGE_SUBMIT' }
>;

export type RightPanelProps = {
  rightMode: AppViewModel['rightMode'];
  terminal: AppViewModel['terminal'];
  chat: AppViewModel['chat'];
  dispatch: (intent: RightIntent) => void;
  minwPx: number;
  subscribeTerminalEvent?: SubscribeTerminalEvent;
};

export const RightPanel = React.memo(function RightPanel(props: RightPanelProps) {
  const panelVariant = props.rightMode === 'terminal' ? 'terminal' : 'default';
  const headerTabs =
    props.rightMode === 'terminal' ? (
      <div className={styles.headerTabs} role="tablist" aria-label="终端页签">
        {props.terminal.panelIds.map((id, idx) => (
          <ClosableTab
            key={id}
            selected={id === props.terminal.activePanelId}
            title={`PS${idx + 1}`}
            variant="terminal"
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
            variant="default"
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
      bodyBleed
      variant={panelVariant}
      header={
        <div className={styles.header} data-mode={props.rightMode} aria-label="右区头部内容">
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
            active={props.rightMode !== 'terminal'}
            variant={props.rightMode === 'terminal' ? 'soft' : 'solid'}
            title="新增"
            ariaLabel="新增面板"
            icon={<Icon name="plus" />}
            onClick={() => props.dispatch({ type: 'RIGHT_PANEL_ADD' })}
          />
        </div>
      }
    >
      <div className={styles.stack} aria-label="右区内容">
        <div className={styles.pane} data-active={props.rightMode === 'terminal' ? '1' : '0'}>
          <TerminalView
            terminal={props.terminal}
            dispatch={props.dispatch}
            subscribeTerminalEvent={props.subscribeTerminalEvent}
            visible={props.rightMode === 'terminal'}
          />
        </div>
        <div className={styles.pane} data-active={props.rightMode === 'chat' ? '1' : '0'}>
          <ChatView chat={props.chat} dispatch={props.dispatch} />
        </div>
      </div>
    </Panel>
  );
});
