import React from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '../../primitives/Icons';
import { Badge } from '../../primitives/Badge';
import { Panel, PanelHeaderIcon } from '../../primitives/Panel';
import { TiltedCard } from '../../primitives/TiltedCard';
import { Button } from '../../primitives/shadcn/button';
import { Input } from '../../primitives/shadcn/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../../primitives/shadcn/sheet';
import { Textarea } from '../../primitives/shadcn/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/shadcn/tooltip';
import styles from './CenterPanel.module.css';

function LineNumberedCode(props: { text: string }) {
  const lines = React.useMemo(() => props.text.replaceAll('\r\n', '\n').split('\n'), [props.text]);

  return (
    <div className={styles.code} aria-label="文本预览">
      {lines.map((line, idx) => (
        <div key={idx} className={styles.codeLine}>
          <span className={styles.codeNo} aria-hidden="true">
            {idx + 1}
          </span>
          <span className={styles.codeText}>{line.length ? line : ' '}</span>
        </div>
      ))}
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
  | { type: 'TASK_ITEM_OPEN' }
  | { type: 'TASK_DETAIL_CLOSE' }
  | { type: 'TASK_DETAIL_MODE_SET' }
  | { type: 'TASK_DETAIL_DRAFT_SET' }
  | { type: 'TASK_DETAIL_SAVE' }
  | { type: 'TASK_ITEM_START' }
>;

export type CenterPanelProps = {
  content: AppViewModel['content'];
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

export function CenterPanel(props: CenterPanelProps) {
  const file = props.content.file;
  const effectiveText = props.content.isDirty ? props.content.draftText : props.content.text;
  const find = props.content.find;
  const taskBoard = props.content.taskBoard;
  const taskItems = taskBoard?.items ?? [];
  const tiltDisabled = taskItems.length > 80;
  const activeTask = taskBoard?.activeTaskId ? taskItems.find((t) => t.id === taskBoard.activeTaskId) : null;
  const findInputRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!file) return;
    if (!find.isOpen) return;
    const t = setTimeout(() => findInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [file, find.isOpen]);

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
      el.setSelectionRange(start, end);
    } catch {}
  }, [file, find.activeIndex, find.isOpen, find.matchStarts, find.query, props.content.mode]);

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
            {file && find.isOpen ? (
              <div className={styles.findBar} aria-label="文件内查找">
                <input
                  ref={findInputRef}
                  className={styles.findInput}
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
                <div className={styles.findMeta} aria-label="匹配计数">
                  {find.matchStarts.length ? `${find.activeIndex + 1}/${find.matchStarts.length}` : '0/0'}
                </div>
                <button className={styles.findButton} type="button" onClick={() => props.dispatch({ type: 'CONTENT_FIND_PREV' })}>
                  上一个
                </button>
                <button className={styles.findButton} type="button" onClick={() => props.dispatch({ type: 'CONTENT_FIND_NEXT' })}>
                  下一个
                </button>
                <button className={styles.findClose} type="button" aria-label="关闭查找" onClick={() => props.dispatch({ type: 'CONTENT_FIND_CLOSE' })}>
                  <Icon name="close" />
                </button>
              </div>
            ) : null}
          </div>
          {file && file.kind !== 'image' ? (
            <div className={styles.headerActions}>
              <button
                className={styles.modeButton}
                type="button"
                onClick={() => props.dispatch({ type: 'CONTENT_TOGGLE_VIEW_MODE' })}
              >
                {modeLabel}
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
            <div className={styles.taskCards}>
              {taskItems.map((t) => (
                <div key={t.id} className={styles.taskCardRow} style={{ paddingLeft: `${t.level * 18}px` }}>
                  <TiltedCard disabled={tiltDisabled} rotateAmplitude={6} scaleOnHover={1.02}>
                    <article
                      className={styles.taskCard}
                      data-checked={t.checked ? 'true' : 'false'}
                      data-active={t.id === taskBoard?.activeTaskId ? 'true' : 'false'}
                      role="button"
                      tabIndex={0}
                      aria-label={`打开任务详情：${t.title}`}
                      onClick={() => props.dispatch({ type: 'TASK_ITEM_OPEN', taskId: t.id })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          props.dispatch({ type: 'TASK_ITEM_OPEN', taskId: t.id });
                        }
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className={`${styles.taskStartBtn} !shadow-none`}
                            aria-label={`开始：${t.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              props.dispatch({ type: 'TASK_ITEM_START', taskId: t.id });
                            }}
                          >
                            <Icon name="terminal" size={16} title="开始" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={8}>
                          开始
                        </TooltipContent>
                      </Tooltip>

                      <div className={styles.taskHeaderRow}>
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

                        <div className={styles.taskMain}>
                          <div className={styles.taskTitleRow}>
                            <div className={styles.taskTitle}>{t.title}</div>
                            <Badge tone={t.checked ? 'secondary' : 'primary'}>{t.checked ? '完成' : '待办'}</Badge>
                          </div>
                          {t.summary ? (
                            <div className={styles.taskSummary}>{t.summary}</div>
                          ) : (
                            <div className={styles.taskSummaryMuted}>点击查看详情</div>
                          )}
                        </div>
                      </div>
                    </article>
                  </TiltedCard>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.muted}>未解析到任务（只识别形如 “- [ ] xxx” 的任务行）。</div>
          )}

          <Sheet
            open={Boolean(taskBoard?.detail.isOpen)}
            onOpenChange={(open) => {
              if (open) return;
              props.dispatch({ type: 'TASK_DETAIL_CLOSE' });
            }}
          >
            {taskBoard ? (
              <SheetContent side="right" className={`${styles.taskSheet} !shadow-none`}>
                <SheetHeader className={styles.taskSheetHeader}>
                  <SheetTitle>{activeTask?.title ?? '任务详情'}</SheetTitle>
                  <SheetDescription>
                    {activeTask?.summary ? `摘要：${activeTask.summary}` : '在这里查看与编辑该任务块。'}
                  </SheetDescription>
                </SheetHeader>

                <div className={styles.taskSheetBody}>
                  {taskBoard.detail.mode === 'edit' ? (
                    <div className={styles.taskForm}>
                      <label className={styles.taskField}>
                        <div className={styles.taskFieldLabel}>标题</div>
                        <Input
                          className="!shadow-none"
                          value={taskBoard.detail.draftTitle}
                          onChange={(e) =>
                            props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', title: e.currentTarget.value })
                          }
                        />
                      </label>

                      <label className={styles.taskField}>
                        <div className={styles.taskFieldLabel}>详情</div>
                        <Textarea
                          className="!shadow-none"
                          value={taskBoard.detail.draftBody}
                          onChange={(e) =>
                            props.dispatch({ type: 'TASK_DETAIL_DRAFT_SET', body: e.currentTarget.value })
                          }
                          spellCheck={false}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className={styles.taskPreview} aria-label="任务详情预览">
                      <div className={styles.taskPreviewTitle}>{taskBoard.detail.draftTitle}</div>
                      <div className={styles.taskPreviewBody}>
                        {taskBoard.detail.draftBody ? taskBoard.detail.draftBody : '暂无详情。'}
                      </div>
                    </div>
                  )}
                </div>

                <SheetFooter className={styles.taskSheetFooter}>
                  {taskBoard.detail.mode === 'edit' ? (
                    <div className={styles.taskSheetActions}>
                      <Button
                        type="button"
                        variant="outline"
                        className="!shadow-none"
                        onClick={() => props.dispatch({ type: 'TASK_DETAIL_MODE_SET', mode: 'view' })}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        className="!shadow-none"
                        disabled={props.content.saveStatus === 'saving'}
                        onClick={() => props.dispatch({ type: 'TASK_DETAIL_SAVE' })}
                      >
                        {props.content.saveStatus === 'saving' ? '保存中…' : '保存'}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.taskSheetActions}>
                      <Button
                        type="button"
                        variant="outline"
                        className="!shadow-none"
                        onClick={() => props.dispatch({ type: 'TASK_DETAIL_MODE_SET', mode: 'edit' })}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!shadow-none"
                        onClick={() => props.dispatch({ type: 'TASK_DETAIL_CLOSE' })}
                      >
                        关闭
                      </Button>
                    </div>
                  )}
                </SheetFooter>
              </SheetContent>
            ) : null}
          </Sheet>
        </div>
      ) : file.kind === 'image' ? (
        <div className={styles.imageWrap} aria-label="图片预览">
          {effectiveText ? <img className={styles.image} src={effectiveText} alt={file.name} /> : <div className={styles.muted}>图片内容为空。</div>}
        </div>
      ) : file.kind === 'markdown' || file.kind === 'task' ? (
        <div className={styles.markdown} aria-label="渲染预览">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {effectiveText}
          </ReactMarkdown>
        </div>
      ) : (
        <LineNumberedCode text={effectiveText} />
      )}

      {props.content.saveError ? <div className={styles.error}>{props.content.saveError}</div> : null}
    </Panel>
  );
}
