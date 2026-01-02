import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import ReactMarkdown from 'react-markdown';
import { Icon } from '../../primitives/Icons';
import { Badge } from '../../primitives/Badge';
import { Panel, PanelHeaderIcon } from '../../primitives/Panel';
import styles from './CenterPanel.module.css';

type CenterIntent = Extract<
  UIIntent,
  | { type: 'CONTENT_TOGGLE_VIEW_MODE' }
  | { type: 'CONTENT_DRAFT_SET' }
  | { type: 'CONTENT_SAVE_REQUEST' }
  | { type: 'TASK_ITEM_TOGGLE' }
>;

export type CenterPanelProps = {
  content: AppViewModel['content'];
  dispatch: (intent: CenterIntent) => void;
  minwPx: number;
};

export function CenterPanel(props: CenterPanelProps) {
  const file = props.content.file;
  const effectiveText = props.content.isDirty ? props.content.draftText : props.content.text;

  const modeLabel = (() => {
    if (!file) return '切换';
    if (file.kind === 'task') {
      if (props.content.mode === 'task') return '切到渲染';
      if (props.content.mode === 'view') return '切到源码';
      return '切到任务';
    }
    if (props.content.mode === 'view') return '切到源码';
    return '切到渲染';
  })();

  const saveBadge = (() => {
    if (!file) return null;
    if (props.content.saveStatus === 'saving') return <Badge tone="accent">保存中</Badge>;
    if (props.content.saveStatus === 'saved') return <Badge tone="secondary">已保存</Badge>;
    if (props.content.saveStatus === 'conflict') return <Badge tone="accent">冲突</Badge>;
    if (props.content.saveStatus === 'error') return <Badge tone="accent">错误</Badge>;
    if (props.content.isDirty) return <Badge tone="primary">未保存</Badge>;
    return <Badge>就绪</Badge>;
  })();

  return (
    <Panel
      as="section"
      ariaLabel="中区"
      headerAriaLabel="中区头部"
      bodyAriaLabel="中区滚动区"
      minwPx={props.minwPx}
      header={
        <div className={styles.header}>
          <PanelHeaderIcon ariaLabel="内容">
            <Icon name="tasks" />
          </PanelHeaderIcon>
          <div className={styles.headerMain}>
            <div className={styles.titleRow}>
              <div className={styles.fileName}>{file ? file.name : '未打开文件'}</div>
              {saveBadge}
            </div>
            <div className={styles.filePath}>{file ? file.path : '先点击顶部“打开项目”，再在左区选择文件。'}</div>
          </div>
          {file ? (
            <div className={styles.headerActions}>
              <button
                className={styles.modeButton}
                type="button"
                onClick={() => props.dispatch({ type: 'CONTENT_TOGGLE_VIEW_MODE' })}
              >
                {modeLabel}
              </button>
              <button
                className={styles.saveButton}
                type="button"
                disabled={!props.content.isDirty || props.content.saveStatus === 'saving'}
                onClick={() => props.dispatch({ type: 'CONTENT_SAVE_REQUEST' })}
              >
                保存
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      {!file ? (
        <div className={styles.empty} aria-label="空内容">
          <p className={styles.emptyTitle}>还没有打开任何文件</p>
          <p className={styles.emptyDesc}>打开项目后，在左区点击一个文件即可在这里预览/编辑。</p>
        </div>
      ) : props.content.mode === 'editor' ? (
        <div className={styles.editorWrap} aria-label="源码编辑">
          <textarea
            className={styles.editor}
            value={props.content.draftText}
            onChange={(e) => props.dispatch({ type: 'CONTENT_DRAFT_SET', text: e.currentTarget.value })}
            spellCheck={false}
          />
        </div>
      ) : file.kind === 'task' && props.content.mode === 'task' ? (
        <div className={styles.taskBoard} aria-label="任务看板">
          {props.content.taskBoard?.items?.length ? (
            <ul className={styles.taskList}>
              {props.content.taskBoard.items.map((t) => (
                <li key={t.id} className={styles.taskItem} style={{ paddingLeft: `${t.level * 18}px` }}>
                  <button
                    className={styles.taskToggle}
                    type="button"
                    role="checkbox"
                    aria-checked={t.checked}
                    onClick={() => props.dispatch({ type: 'TASK_ITEM_TOGGLE', taskId: t.id, source: t.source })}
                  >
                    <span className={styles.taskBox} aria-hidden="true">
                      {t.checked ? '✓' : ''}
                    </span>
                    <span className={styles.taskLabel}>{t.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.muted}>未解析到任务（只识别形如 “- [ ] xxx” 的任务行）。</div>
          )}
        </div>
      ) : file.kind === 'markdown' || file.kind === 'task' ? (
        <div className={styles.markdown} aria-label="渲染预览">
          <ReactMarkdown>{effectiveText}</ReactMarkdown>
        </div>
      ) : (
        <pre className={styles.pre} aria-label="文本预览">
          {effectiveText}
        </pre>
      )}

      {props.content.saveError ? <div className={styles.error}>{props.content.saveError}</div> : null}
    </Panel>
  );
}
