import React from 'react';
import type { SpecWaveInitStepStatus, SpecWaveInitWizardVM, UIIntent } from '@specwave/contracts';

import { Button } from '../../primitives/shadcn/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../primitives/shadcn/ui/card';
import { Badge } from '../../primitives/shadcn/ui/badge';
import { Progress } from '../../primitives/shadcn/ui/progress';
import { ScrollArea } from '../../primitives/shadcn/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '../../primitives/shadcn/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../primitives/shadcn/ui/dialog';

type SpecwaveInitIntent = Extract<
  UIIntent,
  | { type: 'SPECWAVE_INIT_OPEN' }
  | { type: 'SPECWAVE_INIT_START' }
  | { type: 'SPECWAVE_INIT_RETRY' }
  | { type: 'SPECWAVE_INIT_CLOSE' }
  | { type: 'SPECWAVE_INIT_COPY_ERROR' }
>;

export function SpecWaveUninitializedCard(props: { dispatch: (intent: SpecwaveInitIntent) => void }) {
  return (
    <Card className="mx-2 my-2 shadow-none">
      <CardHeader className="px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">这个项目还没初始化</CardTitle>
          <Badge variant="secondary">未初始化</Badge>
        </div>
        <CardDescription className="text-xs leading-relaxed">
          初始化会生成 <span className="font-mono">.specwave/</span> 与工作区目录，之后左栏会展示 SpecWave 工作区树。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-0 pt-0">
        <div className="rounded-md border bg-muted/20 px-2 py-2 text-[11px] text-muted-foreground">
          说明：执行过程可重试；失败会显示错误信息并支持复制。
        </div>
      </CardContent>
      <CardFooter className="px-3 pb-3 pt-3">
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            props.dispatch({ type: 'SPECWAVE_INIT_OPEN' });
          }}
        >
          初始化
        </Button>
      </CardFooter>
    </Card>
  );
}

function badgeVariantForStepStatus(status: SpecWaveInitStepStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'doing':
      return 'secondary';
    case 'done':
      return 'default';
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function SpecWaveInitDialog(props: { init: SpecWaveInitWizardVM | null; dispatch: (intent: SpecwaveInitIntent) => void }) {
  const init = props.init;
  if (!init) return null;

  const canClose = init.actions.canClose;
  const canRetry = init.actions.canRetry;
  const canStart = init.actions.canStart;

  const errorText = init.error?.copyText ?? (init.error ? [init.error.title, init.error.detail].filter(Boolean).join('\n') : '');
  const phaseLabel =
    init.phase === 'running'
      ? '执行中'
      : init.phase === 'success'
        ? '已完成'
        : init.phase === 'failure'
          ? '失败'
          : '待开始';
  const phaseBadgeVariant = init.phase === 'failure' ? 'destructive' : init.phase === 'running' ? 'default' : 'secondary';
  const currentStepIndex = (() => {
    const idxDoing = init.steps.findIndex((s) => s.status === 'doing');
    if (idxDoing >= 0) return idxDoing;
    const idxError = init.steps.findIndex((s) => s.status === 'error');
    if (idxError >= 0) return idxError;
    const idxLastDone = [...init.steps].reverse().findIndex((s) => s.status === 'done');
    if (idxLastDone >= 0) return init.steps.length - 1 - idxLastDone;
    return 0;
  })();
  const stepHint = init.steps[currentStepIndex]?.title ? `第 ${currentStepIndex + 1} 步：${init.steps[currentStepIndex]!.title}` : '';

  return (
    <Dialog
      open={init.isOpen}
      onOpenChange={(open) => {
        if (!open) props.dispatch({ type: 'SPECWAVE_INIT_CLOSE' });
        if (open) props.dispatch({ type: 'SPECWAVE_INIT_OPEN' });
      }}
    >
      <DialogContent
        className="flex max-w-[720px] flex-col gap-0 p-0"
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
      >
        <div className="border-b px-6 py-4">
          <DialogHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-base">初始化 SpecWave</DialogTitle>
                <DialogDescription className="text-xs">
                  流程对齐 `CLI`：命令行。{init.phase === 'running' ? '执行中可关闭，任务仍会在后台继续。' : '确认后再开始写入文件。'}
                </DialogDescription>
              </div>
              <Badge variant={phaseBadgeVariant} className="shrink-0">
                {phaseLabel}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">步骤</div>
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="space-y-2">
                  {init.steps.map((s, idx) => {
                    const isActive = idx === currentStepIndex && (init.phase === 'running' || init.phase === 'failure');
                    const dotClass =
                      s.status === 'done'
                        ? 'bg-foreground'
                        : s.status === 'doing'
                          ? 'bg-blue-500'
                          : s.status === 'error'
                            ? 'bg-destructive'
                            : 'bg-muted-foreground/40';
                    return (
                      <div key={s.key} className={isActive ? 'rounded-sm bg-muted/30 px-2 py-1' : 'px-2 py-1'}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-xs">{s.title}</div>
                              <Badge variant={badgeVariantForStepStatus(s.status)} className="h-5 px-2 text-[10px]">
                                {idx + 1}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border bg-muted/10 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{stepHint || init.progress?.label || (init.phase === 'running' ? '正在执行…' : '准备就绪')}</span>
                  <span>{init.progress ? `${Math.max(0, Math.min(100, Math.round(init.progress.percent)))}%` : ''}</span>
                </div>
                <div className="mt-2">
                  <Progress value={init.progress?.percent ?? 0} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">日志摘要</div>
                <div className="text-[11px] text-muted-foreground">{init.logs.length > 0 ? `最近 ${init.logs.length} 条` : '暂无'}</div>
              </div>

              {init.error ? (
                <Alert variant="destructive">
                  <AlertTitle>{init.error.title}</AlertTitle>
                  <AlertDescription>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed">{init.error.detail ?? ''}</div>
                  </AlertDescription>
                  {errorText ? (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => props.dispatch({ type: 'SPECWAVE_INIT_COPY_ERROR', text: errorText })}
                      >
                        复制错误
                      </Button>
                    </div>
                  ) : null}
                </Alert>
              ) : null}

              <ScrollArea className="h-52 rounded-md border bg-muted/10">
                <div className="space-y-1 p-3 font-mono text-[11px] leading-relaxed">
                  {init.logs.length === 0 ? <div className="text-muted-foreground">暂无日志。</div> : null}
                  {init.logs.map((l, idx) => (
                    <div
                      key={idx}
                      className={
                        l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-amber-700 dark:text-amber-500' : ''
                      }
                    >
                      <span className="mr-2 select-none opacity-60">{String(idx + 1).padStart(3, '0')}</span>
                      {l.time ? <span className="mr-2 opacity-70">{l.time}</span> : null}
                      <span className="opacity-80">[{l.level}]</span> {l.text}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {init.phase === 'success' ? (
                <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  已完成初始化。左栏工作区会自动刷新并展示 <span className="font-mono">.specwave/workspace</span>。
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-2">
          <Button variant="outline" disabled={!canClose} onClick={() => props.dispatch({ type: 'SPECWAVE_INIT_CLOSE' })}>
            关闭
          </Button>
          {init.phase === 'idle' ? (
            <Button disabled={!canStart} onClick={() => props.dispatch({ type: 'SPECWAVE_INIT_START' })}>
              开始初始化
            </Button>
          ) : null}
          {init.phase === 'failure' ? (
            <Button disabled={!canRetry} onClick={() => props.dispatch({ type: 'SPECWAVE_INIT_RETRY' })}>
              重试
            </Button>
          ) : null}
          {init.phase === 'success' ? <Button onClick={() => props.dispatch({ type: 'SPECWAVE_INIT_CLOSE' })}>完成</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
