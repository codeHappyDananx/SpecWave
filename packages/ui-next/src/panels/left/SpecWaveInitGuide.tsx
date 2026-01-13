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

  return (
    <Dialog
      open={init.isOpen}
      onOpenChange={(open) => {
        if (!open) props.dispatch({ type: 'SPECWAVE_INIT_CLOSE' });
        if (open) props.dispatch({ type: 'SPECWAVE_INIT_OPEN' });
      }}
    >
      <DialogContent
        className="max-w-[560px]"
        onEscapeKeyDown={(e) => {
          if (!canClose) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!canClose) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>初始化 SpecWave</DialogTitle>
          <DialogDescription>流程对齐 `CLI`：命令行，执行中会持续输出进度与日志。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {init.steps.map((s, idx) => (
              <Badge key={s.key} variant={badgeVariantForStepStatus(s.status)} className="gap-1">
                <span className="opacity-80">{idx + 1}</span>
                <span>{s.title}</span>
              </Badge>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{init.progress?.label ?? (init.phase === 'running' ? '正在执行…' : '准备就绪')}</span>
              <span>{init.progress ? `${Math.max(0, Math.min(100, Math.round(init.progress.percent)))}%` : ''}</span>
            </div>
            <Progress value={init.progress?.percent ?? 0} />
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

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">日志摘要</div>
            <ScrollArea className="h-40 rounded-md border bg-muted/20">
              <div className="space-y-1 p-3 font-mono text-[11px] leading-relaxed">
                {init.logs.length === 0 ? <div className="text-muted-foreground">暂无日志。</div> : null}
                {init.logs.map((l, idx) => (
                  <div key={idx} className={l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-amber-600' : ''}>
                    {l.time ? <span className="mr-2 opacity-70">{l.time}</span> : null}
                    <span className="opacity-80">[{l.level}]</span> {l.text}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
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
