import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Panel } from '../../primitives/Panel';
import { TiltedCard } from '../../primitives/TiltedCard';
import { Input } from '../../primitives/shadcn/input';
import { Textarea } from '../../primitives/shadcn/textarea';
import { PhaseIndicator } from './PhaseIndicator';
import { ReactBitsStepper } from './ReactBitsStepper';
import styles from './CenterPanel.module.css';

/** 高亮文本中的查询词 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  // split + 捕获组：命中片段固定出现在奇数下标，避免使用带 g 的 regex.test 导致 lastIndex 乱跳。
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={styles.highlight}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function splitFirstLines(text: string, maxLines: number, maxChars: number) {
  const normalized = text.replaceAll('\r\n', '\n');
  const lines: string[] = [];
  let start = 0;
  const limit = Math.min(normalized.length, maxChars);
  for (let i = 0; i < limit && lines.length < maxLines; i++) {
    if (normalized[i] !== '\n') continue;
    lines.push(normalized.slice(start, i));
    start = i + 1;
  }
  const reachedCharLimit = limit < normalized.length;
  if (lines.length < maxLines && !reachedCharLimit) {
    lines.push(normalized.slice(start));
    return { lines, truncated: false };
  }
  // 走到这里说明：行数到顶或字符到顶，需要截断；最后一行补上“当前片段剩余”。
  lines.push(normalized.slice(start, limit));
  return { lines, truncated: true };
}

function LineNumberedCode(props: { text: string; query: string }) {
  const { lines, truncated } = React.useMemo(() => splitFirstLines(props.text, 4000, 200_000), [props.text]);

  return (
    <div className={styles.code} aria-label="文本预览">
      {truncated ? <div className={styles.muted}>内容较长，仅预览前 4000 行 / 20 万字符；可切到源码查看全量内容（可能会卡顿）。</div> : null}
      {lines.map((line, idx) => (
        <div key={idx} className={styles.codeLine}>
          <span className={styles.codeNo} aria-hidden="true">
            {idx + 1}
          </span>
          <span className={styles.codeText}>{line.length ? highlightText(line, props.query) : ' '}</span>
        </div>
      ))}
    </div>
  );
}

type TaskDetailItem = {
  label: string;
  value: string;
  raw: string;
};

function parseTaskDetailItems(body: string) {
  const normalized = body.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  const items: TaskDetailItem[] = [];
  const rest: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^[-*+]\s+/, '').trim();
    const match = cleaned.match(/^([\u4e00-\u9fa5A-Za-z0-9_\- ]{1,24})[：:]\s*(.*)$/);
    if (match) {
      const label = match[1]?.trim() ?? '';
      const value = match[2]?.trim() ?? '';
      if (label) {
        items.push({ label, value, raw: trimmed });
        continue;
      }
    }
    rest.push(trimmed);
  }

  return { items, restText: rest.join('\n').trim() };
}

function TaskDetailView(props: { body: string; onEdit: () => void }) {
  const rawBody = props.body ?? '';
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return (
      <div
        className={styles.taskBodyText}
        role="button"
        tabIndex={0}
        aria-label="双击编辑正文"
        onDoubleClick={props.onEdit}
      >
        暂无详情。
      </div>
    );
  }

  const { items, restText } = parseTaskDetailItems(rawBody);
  if (!items.length) {
    return (
      <div
        className={styles.taskBodyText}
        role="button"
        tabIndex={0}
        aria-label="双击编辑正文"
        onDoubleClick={props.onEdit}
      >
        {rawBody}
      </div>
    );
  }

  return (
    <div className={styles.taskDetail} role="button" tabIndex={0} aria-label="双击编辑正文" onDoubleClick={props.onEdit}>
      <div className={styles.taskDetailList}>
        {items.map((item, idx) => (
          <div key={`${item.label}-${idx}`} className={styles.taskDetailItem}>
            <div className={styles.taskDetailLabel}>{item.label}</div>
            <div className={styles.taskDetailValue}>{item.value || '—'}</div>
          </div>
        ))}
      </div>
      {restText ? <div className={styles.taskDetailNote}>{restText}</div> : null}
    </div>
  );
}

type CenterIntent = Extract<
  UIIntent,
  | { type: 'CONTENT_TOGGLE_VIEW_MODE' }
  | { type: 'CONTENT_DRAFT_SET' }
  | { type: 'CONTENT_FIND_SET_QUERY' }
  | { type: 'CONTENT_FIND_NEXT' }
  | { type: 'CONTENT_FIND_PREV' }
  | { type: 'CONTENT_FIND_CLOSE' }
  | { type: 'TASK_ITEM_TOGGLE' }
  | { type: 'TASK_DETAIL_OPEN' }
  | { type: 'TASK_DETAIL_CLOSE' }
  | { type: 'TASK_DETAIL_MODE_SET' }
  | { type: 'TASK_DETAIL_DRAFT_SET' }
  | { type: 'TASK_DETAIL_SAVE' }
  | { type: 'TASK_ITEM_START' }
  | { type: 'TASK_DECK_MODE_SET' }
  | { type: 'TASK_DECK_PREV' }
  | { type: 'TASK_DECK_NEXT' }
  | { type: 'TASK_DECK_FOCUS' }
  | { type: 'TASK_LINKED_DOC_JUMP' }
  | { type: 'TASK_LINKED_DOCS_TOGGLE_SECTION' }
  | { type: 'PHASE_INDICATOR_CLICK' }
  | { type: 'STORY_STEPPER_PHASE_CLICK' }
>;

export type CenterPanelProps = {
  content: AppViewModel['content'];
  phaseIndicator: AppViewModel['phaseIndicator'];
  storyStepper: AppViewModel['storyStepper'];
  dispatch: (intent: CenterIntent) => void;
  minwPx: number;
};

const markdownComponents: Components = {
  table({ node: _node, className, children, ...props }) {
    const mergedClassName = className ? `${styles.table} ${className}` : styles.table;
    return (
      <div className={styles.tableWrap}>
        <table className={mergedClassName} {...props}>
          {children}
        </table>
      </div>
    );
  }
};

/** 创建带高亮功能的 markdown 组件 */
function createHighlightComponents(query: string): Components {
  return {
    table({ node: _node, className, children, ...props }) {
      const mergedClassName = className ? `${styles.table} ${className}` : styles.table;
      return (
        <div className={styles.tableWrap}>
          <table className={mergedClassName} {...props}>
            {children}
          </table>
        </div>
      );
    },
    // 高亮文本节点
    p({ children, ...props }) {
      return <p {...props}>{highlightChildren(children, query)}</p>;
    },
    li({ children, ...props }) {
      return <li {...props}>{highlightChildren(children, query)}</li>;
    },
    h1({ children, ...props }) {
      return <h1 {...props}>{highlightChildren(children, query)}</h1>;
    },
    h2({ children, ...props }) {
      return <h2 {...props}>{highlightChildren(children, query)}</h2>;
    },
    h3({ children, ...props }) {
      return <h3 {...props}>{highlightChildren(children, query)}</h3>;
    },
    h4({ children, ...props }) {
      return <h4 {...props}>{highlightChildren(children, query)}</h4>;
    },
    strong({ children, ...props }) {
      return <strong {...props}>{highlightChildren(children, query)}</strong>;
    },
    em({ children, ...props }) {
      return <em {...props}>{highlightChildren(children, query)}</em>;
    },
    code({ children, ...props }) {
      return <code {...props}>{highlightChildren(children, query)}</code>;
    }
  };
}

/** 递归高亮子节点中的文本 */
function highlightChildren(children: React.ReactNode, query: string): React.ReactNode {
  if (!query.trim()) return children;
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return highlightText(child, query);
    }
    return child;
  });
}

export const CenterPanel = React.memo(function CenterPanel(props: CenterPanelProps) {
  const file = props.content.file;
  const effectiveText = props.content.isDirty ? props.content.draftText : props.content.text;
  const find = props.content.find;
  const taskBoard = props.content.taskBoard;
  const taskItems = taskBoard?.items ?? [];
  const tiltDisabled = taskItems.length > 80;
  const deckMode = taskBoard?.deckMode ?? 'single';
  const activeTaskId = taskBoard?.activeTaskId ?? taskItems[0]?.id ?? null;
  const activeIndex = activeTaskId ? Math.max(0, taskItems.findIndex((t) => t.id === activeTaskId)) : 0;
  const activeTask = activeTaskId ? taskItems.find((t) => t.id === activeTaskId) : null;
  const isEditing = Boolean(taskBoard?.detail.isOpen && taskBoard.detail.mode === 'edit');
  const findInputRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const findBarRef = React.useRef<HTMLDivElement | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!file) return;
    if (!find.isOpen) return;
    const t = setTimeout(() => findInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [file, find.isOpen]);

  // 点击查找框外部时关闭
  React.useEffect(() => {
    if (!find.isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (findBarRef.current && !findBarRef.current.contains(e.target as Node)) {
        props.dispatch({ type: 'CONTENT_FIND_CLOSE' });
      }
    };
    // 延迟添加监听，避免打开时立即触发
    const t = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [find.isOpen, props]);

  React.useEffect(() => {
    if (!file) return;
    if (!find.isOpen) return;
    if (props.content.mode !== 'editor') return;
    const q = find.query.trim();
    if (!q) return;
    const starts = find.matchStarts;
    if (!starts.length) return;
    const idx = Math.min(find.activeIndex, starts.length - 1);
    const start = starts[idx] ?? 0;
    const end = start + q.length;
    const el = editorRef.current;
    if (!el) return;
    try {
      el.focus();
      el.setSelectionRange(start, end);
    } catch {}
  }, [file, find.activeIndex, find.isOpen, find.matchStarts, find.query, props.content.mode]);

  React.useEffect(() => {
    if (!file) return;
    if (!find.isOpen) return;
    if (!find.query.trim()) return;
    if (props.content.mode === 'editor') return;
    const root = previewRef.current;
    if (!root) return;
    const t = window.setTimeout(() => {
      const marks = root.querySelectorAll(`mark.${styles.highlight}`);
      if (!marks.length) return;
      const idx = Math.min(find.activeIndex, marks.length - 1);
      const el = marks[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 0);
    return () => window.clearTimeout(t);
  }, [file, find.activeIndex, find.isOpen, find.query, props.content.mode]);

  const modeLabel = (() => {
    if (!file) return '切换';
    if (file.kind === 'task') {
      if (props.content.mode === 'task') return '切到渲染';
      if (props.content.mode === 'view') return '切到源码';
      return '切到任务';
    }
    if (file.kind === 'image') return '切换';
    if (props.content.mode === 'view') return '切到源码';
    return '切到渲染';
  })();

  const modeButtonDisabled = Boolean(file && modeLabel === '切到源码' && effectiveText.length > 300_000);
  const modeButtonTitle = modeButtonDisabled ? '内容过大，禁用源码编辑以避免卡死。' : modeLabel;

  // 悬浮查找框组件
  const floatingFindBar = file && find.isOpen ? (
    <div ref={findBarRef} className={styles.findBarFloat} aria-label="文件内查找">
      <input
        ref={findInputRef}
        className={styles.findInputCompact}
        type="search"
        value={find.query}
        placeholder="查找…"
        onChange={(e) => props.dispatch({ type: 'CONTENT_FIND_SET_QUERY', query: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            props.dispatch({ type: 'CONTENT_FIND_CLOSE' });
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) props.dispatch({ type: 'CONTENT_FIND_PREV' });
            else props.dispatch({ type: 'CONTENT_FIND_NEXT' });
          }
        }}
      />
      <span className={styles.findMetaCompact}>
        {find.matchStarts.length ? `${find.activeIndex + 1}/${find.matchStarts.length}` : '无结果'}
      </span>
      <button className={styles.findNavBtn} type="button" title="上一个" onClick={() => props.dispatch({ type: 'CONTENT_FIND_PREV' })}>↑</button>
      <button className={styles.findNavBtn} type="button" title="下一个" onClick={() => props.dispatch({ type: 'CONTENT_FIND_NEXT' })}>↓</button>
      <button className={styles.findCloseBtn} type="button" aria-label="关闭查找" title="关闭" onClick={() => props.dispatch({ type: 'CONTENT_FIND_CLOSE' })}>×</button>
    </div>
  ) : null;

  return (
    <div className={styles.centerPanelWrapper}>
      <Panel
        as="section"
        ariaLabel="中区"
        headerAriaLabel="中区头部"
        bodyAriaLabel="中区滚动区"
        minwPx={props.minwPx}
        header={
          <>
            {/* 当 Stepper 可见时，显示 Story 标题 + Stepper，隐藏文件路径和旧的 PhaseIndicator */}
            {!props.storyStepper.visible && (
              <PhaseIndicator indicator={props.phaseIndicator} dispatch={props.dispatch} />
          )}
          {props.storyStepper.visible ? (
            <div className={styles.header}>
              <div className={styles.headerMain}>
                <div className={styles.storyTitle}>{props.storyStepper.storyTitle}</div>
              </div>
              <ReactBitsStepper stepper={props.storyStepper} dispatch={props.dispatch} />
            </div>
          ) : (
          <div className={styles.header}>

          <div className={styles.headerMain}>
            <div className={styles.filePath}>{file ? file.path : '先点击顶部“打开项目”，再在左区选择文件。'}</div>

          </div>
          {file && file.kind !== 'image' && file.kind !== 'binary' ? (
            <div className={styles.headerActions}>
              <button
                className={styles.modeButton}
                type="button"
                disabled={modeButtonDisabled}
                title={modeButtonTitle}
                onClick={() => {
                  if (modeButtonDisabled) return;
                  props.dispatch({ type: 'CONTENT_TOGGLE_VIEW_MODE' });
                }}
              >
                {modeLabel}
              </button>
            </div>
          ) : null}
            </div>
          )}
        </>
      }
    >
      {!file ? (
        <div className={styles.empty} aria-label="空内容">
          <p className={styles.emptyTitle}>还没有打开任何文件</p>
          <p className={styles.emptyDesc}>打开项目后，在左区点击一个文件即可在这里预览/编辑。</p>
        </div>
      ) : file.kind === 'binary' ? (
        <div className={styles.empty} aria-label="不支持预览">
          <p className={styles.emptyTitle}>该文件暂不支持预览</p>
          <p className={styles.emptyDesc}>这是二进制文件（例如 .exe）。为避免卡死，SpecWave 不会打开它。</p>
        </div>
      ) : props.content.mode === 'editor' ? (
        <div className={styles.editorWrap} aria-label="源码编辑">
          {floatingFindBar}
          <textarea
            ref={editorRef}
            className={styles.editor}
            value={props.content.draftText}
            onChange={(e) => props.dispatch({ type: 'CONTENT_DRAFT_SET', text: e.currentTarget.value })}
            spellCheck={false}
          />
        </div>
      ) : file.kind === 'task' && props.content.mode === 'task' ? (
        <div className={styles.taskBoard} aria-label="任务看板">
          {taskItems.length ? (
            <>
              <div className={styles.previewStage} aria-label="预览舞台">
                <div className={styles.stageBar} aria-label="舞台提示条">
                  <div className={styles.stageBarTitle}>03-任务.md · 任务卡片</div>
                  <div className={styles.stageBarHint}>
                    {deckMode === 'all' ? `全部 · ${taskItems.length} 条` : `${activeIndex + 1}/${taskItems.length}`}
                  </div>
                </div>

                <div className={styles.stageInner}>
                  <div className={styles.taskDeckHeader} aria-label="任务导航">
                    <div className={styles.taskDeckNav}>
                      <button
                        className={styles.textLink}
                        type="button"
                        disabled={taskItems.length < 2}
                        onClick={() => props.dispatch({ type: 'TASK_DECK_PREV' })}
                      >
                        上一张
                      </button>
                      <span className={styles.taskDeckMeta}>
                        {deckMode === 'all' ? `全部 · ${taskItems.length} 条` : `${activeIndex + 1}/${taskItems.length}`}
                      </span>
                      <button
                        className={styles.textLink}
                        type="button"
                        disabled={taskItems.length < 2}
                        onClick={() => props.dispatch({ type: 'TASK_DECK_NEXT' })}
                      >
                        下一张
                      </button>
                      <span className={styles.taskDeckSpacer} />
                      <button
                        className={styles.textLink}
                        type="button"
                        onClick={() =>
                          props.dispatch({ type: 'TASK_DECK_MODE_SET', mode: deckMode === 'all' ? 'single' : 'all' })
                        }
                      >
                        {deckMode === 'all' ? '切回单张' : '一键展示全部'}
                      </button>
                    </div>
                  </div>

                  {deckMode === 'single' ? (
                    activeTask ? (
                      <div className={styles.taskDeckStage} data-mode="single">
                        <div className={styles.taskDeckStack}>
                          <TiltedCard
                            persistKey={`task-deck-${activeTask.id}`}
                            disabled={tiltDisabled}
                            rotateAmplitude={4}
                            scaleOnHover={1.01}
                          >
                            <article
                              className={`${styles.taskDeckCard} ${styles.rbFxPrism}`}
                              data-checked={activeTask.checked ? 'true' : 'false'}
                            >
                              <div className={styles.taskDeckCardHeader}>
                                <button
                                  className={styles.taskToggle}
                                  type="button"
                                  role="checkbox"
                                  aria-label={activeTask.checked ? '标记为未完成' : '标记为已完成'}
                                  aria-checked={activeTask.checked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    props.dispatch({ type: 'TASK_ITEM_TOGGLE', taskId: activeTask.id, source: activeTask.source });
                                  }}
                                >
                                  <span className={styles.taskBox} aria-hidden="true">
                                    {activeTask.checked ? '✓' : ''}
                                  </span>
                                </button>

                                <div className={styles.taskDeckTitleWrap}>
                                  <div
                                    className={styles.taskTitle}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="双击编辑标题"
                                    onDoubleClick={() => props.dispatch({ type: 'TASK_DETAIL_OPEN', taskId: activeTask.id, mode: 'edit' })}
                                  >
                                    {activeTask.title}
                                  </div>
                                  {activeTask.summary ? <div className={styles.taskSummary}>{activeTask.summary}</div> : null}
                                </div>

                                <div className={styles.taskDeckCardActions}>
                                  <button
                                    className={styles.btnStart}
                                    type="button"
                                    onClick={() => props.dispatch({ type: 'TASK_ITEM_START', taskId: activeTask.id })}
                                  >
                                    开始
                                  </button>
                                </div>
                              </div>

                              <div className={styles.taskDeckBody}>
                                {isEditing && taskBoard ? (
                                  <div className={styles.taskEdit}>
                                    <Input
                                      className="!shadow-none"
                                      value={taskBoard.detail.draftTitle}
                                      onChange={(e) => props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', title: e.currentTarget.value })}
                                    />
                                    <Textarea
                                      className="!shadow-none"
                                      value={taskBoard.detail.draftBody}
                                      onChange={(e) => props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', body: e.currentTarget.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          props.dispatch({ type: 'TASK_DETAIL_CLOSE' });
                                          return;
                                        }
                                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                          e.preventDefault();
                                          props.dispatch({ type: 'TASK_DETAIL_SAVE' });
                                          props.dispatch({ type: 'TASK_DETAIL_CLOSE' });
                                        }
                                      }}
                                      spellCheck={false}
                                    />
                                    <div className={styles.taskEditHint}>Ctrl+Enter 保存，Esc 退出编辑</div>
                                  </div>
                                ) : (
                                  <TaskDetailView
                                    body={activeTask.body}
                                    onEdit={() => props.dispatch({ type: 'TASK_DETAIL_OPEN', taskId: activeTask.id, mode: 'edit' })}
                                  />
                                )}

                                {/* 关联引用 Badge */}
                                {activeTask.linkedRefs.length > 0 && (
                                  <div style={{ padding: '12px' }}>
                                    <div className={styles.taskFieldLabelMuted}>关联</div>
                                    <div className={styles.linkedRefList}>
                                      {activeTask.linkedRefs.map((ref) => {
                                        const linkedDoc = taskBoard?.linkedDocs.find((d) => d.refId === ref);
                                        return (
                                          <button
                                            key={ref}
                                            className={styles.linkedRefBadge}
                                            type="button"
                                            onClick={() => {
                                              if (linkedDoc) {
                                                props.dispatch({
                                                  type: 'TASK_LINKED_DOC_JUMP',
                                                  refId: ref,
                                                  sourceFile: linkedDoc.sourceFile,
                                                  lineNumber: linkedDoc.lineNumber
                                                });
                                              }
                                            }}
                                          >
                                            {ref}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </article>
                          </TiltedCard>
                        </div>

                        {/* 关联文档区 */}
                        {taskBoard && taskBoard.linkedDocs.length > 0 && (
                          <div className={styles.linkedDocsArea}>
                            <div className={styles.linkedDocsDivider}>关联文档</div>
                            {(() => {
                              const reqDocs = taskBoard.linkedDocs.filter((d) => d.type === 'req');
                              if (!reqDocs.length) return null;
                              return (
                                <div className={styles.linkedDocsSection}>
                                  <div className={styles.linkedDocsSectionHeader}>▼ 关联需求 ({reqDocs.length})</div>
                                  <div className={styles.linkedDocsSectionContent}>
                                    {reqDocs.map((doc) => (
                                      <div key={doc.refId} className={styles.linkedDocCard} role="button" tabIndex={0}
                                        onClick={() => props.dispatch({ type: 'TASK_LINKED_DOC_JUMP', refId: doc.refId, sourceFile: doc.sourceFile, lineNumber: doc.lineNumber })}>
                                        <div className={styles.linkedDocCardTitle}>{doc.refId} {doc.title}</div>
                                        <div className={`${styles.linkedDocCardContent} ${styles.markdown}`}>
                                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {doc.content}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            {(() => {
                              const acDocs = taskBoard.linkedDocs.filter((d) => d.type === 'ac');
                              if (!acDocs.length) return null;
                              return (
                                <div className={styles.linkedDocsSection}>
                                  <div className={styles.linkedDocsSectionHeader}>▼ 验收口径 ({acDocs.length})</div>
                                  <div className={styles.linkedDocsSectionContent}>
                                    {acDocs.map((doc) => (
                                      <div key={doc.refId} className={styles.linkedDocCard} role="button" tabIndex={0}
                                        onClick={() => props.dispatch({ type: 'TASK_LINKED_DOC_JUMP', refId: doc.refId, sourceFile: doc.sourceFile, lineNumber: doc.lineNumber })}>
                                        <div className={styles.linkedDocCardTitle}>{doc.refId}</div>
                                        <div className={`${styles.linkedDocCardContent} ${styles.markdown}`}>
                                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {doc.content}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {taskBoard?.linkedDocsLoading && <div className={styles.linkedDocsLoading}>加载关联文档中...</div>}
                      </div>
                    ) : (
                      <div className={styles.muted}>未解析到任务（只识别形如 “- [ ] xxx” 的任务行）。</div>
                    )
                  ) : (
                    <div className={styles.taskDeckAllList} data-mode="all" aria-label="全部任务卡片">
                      {taskItems.map((t) => {
                        const editingThis = Boolean(isEditing && taskBoard?.activeTaskId === t.id);
                        return (
                          <div key={t.id} className={styles.taskDeckAllItem}>
                            <TiltedCard
                              persistKey={`task-deck-${t.id}`}
                              disabled={tiltDisabled}
                              rotateAmplitude={4}
                              scaleOnHover={1.01}
                            >
                              <article className={`${styles.taskDeckCard} ${styles.rbFxPrism}`} data-checked={t.checked ? 'true' : 'false'}>
                                <div className={styles.taskDeckCardHeader}>
                                  <button
                                    className={styles.taskToggle}
                                    type="button"
                                    role="checkbox"
                                    aria-label={t.checked ? '标记为未完成' : '标记为已完成'}
                                    aria-checked={t.checked}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      props.dispatch({ type: 'TASK_ITEM_TOGGLE', taskId: t.id, source: t.source });
                                    }}
                                  >
                                    <span className={styles.taskBox} aria-hidden="true">
                                      {t.checked ? '✓' : ''}
                                    </span>
                                  </button>

                                  <div className={styles.taskDeckTitleWrap}>
                                    {editingThis && taskBoard ? (
                                      <Input
                                        className="!shadow-none"
                                        value={taskBoard.detail.draftTitle}
                                        onChange={(e) =>
                                          props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', title: e.currentTarget.value })
                                        }
                                      />
                                    ) : (
                                      <div
                                        className={styles.taskTitle}
                                        role="button"
                                        tabIndex={0}
                                        aria-label="双击编辑标题"
                                        onDoubleClick={() => props.dispatch({ type: 'TASK_DETAIL_OPEN', taskId: t.id, mode: 'edit' })}
                                      >
                                        {t.title}
                                      </div>
                                    )}
                                    {t.summary ? <div className={styles.taskSummary}>{t.summary}</div> : null}
                                  </div>

                                  <div className={styles.taskDeckCardActions}>
                                    <button
                                      className={styles.btnStart}
                                      type="button"
                                      onClick={() => props.dispatch({ type: 'TASK_ITEM_START', taskId: t.id })}
                                    >
                                      开始
                                    </button>
                                  </div>
                                </div>

                                <div className={styles.taskDeckBody}>
                                  {editingThis && taskBoard ? (
                                    <div className={styles.taskEdit}>
                                      <Textarea
                                        className="!shadow-none"
                                        value={taskBoard.detail.draftBody}
                                        onChange={(e) =>
                                          props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', body: e.currentTarget.value })
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') {
                                            e.preventDefault();
                                            props.dispatch({ type: 'TASK_DETAIL_CLOSE' });
                                            return;
                                          }
                                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                            e.preventDefault();
                                            props.dispatch({ type: 'TASK_DETAIL_SAVE' });
                                            props.dispatch({ type: 'TASK_DETAIL_CLOSE' });
                                          }
                                        }}
                                        spellCheck={false}
                                      />
                                      <div className={styles.taskEditHint}>Ctrl+Enter 保存，Esc 退出编辑</div>
                                    </div>
                                  ) : (
                                    <TaskDetailView
                                      body={t.body}
                                      onEdit={() => props.dispatch({ type: 'TASK_DETAIL_OPEN', taskId: t.id, mode: 'edit' })}
                                    />
                                  )}
                                </div>
                              </article>
                            </TiltedCard>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.muted}>未解析到任务（只识别形如 “- [ ] xxx” 的任务行）。</div>
          )}
        </div>
      ) : file.kind === 'image' ? (
        <div className={styles.imageWrap} aria-label="图片预览">
          {effectiveText ? <img className={styles.image} src={effectiveText} alt={file.name} /> : <div className={styles.muted}>图片内容为空。</div>}
        </div>
      ) : file.kind === 'markdown' || file.kind === 'task' ? (
        <div ref={previewRef} className={styles.markdown} aria-label="渲染预览">
          {floatingFindBar}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={find.isOpen && find.query.trim() ? createHighlightComponents(find.query) : markdownComponents}
          >
            {effectiveText}
          </ReactMarkdown>
        </div>
      ) : (
        <div ref={previewRef} className={styles.codeWrap}>
          {floatingFindBar}
          <LineNumberedCode text={effectiveText} query={find.isOpen ? find.query : ''} />
        </div>
      )}

      {props.content.saveError ? <div className={styles.error}>{props.content.saveError}</div> : null}
    </Panel>
    </div>
  );
});
