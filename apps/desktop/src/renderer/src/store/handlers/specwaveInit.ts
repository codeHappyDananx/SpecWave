import type { SpecWaveInitWizardVM, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { toExplorerNodes } from '../shared/explorer';
import { joinPath } from '../shared/path';

type InitIntent = Extract<
  UIIntent,
  | { type: 'SPECWAVE_INIT_OPEN' }
  | { type: 'SPECWAVE_INIT_START' }
  | { type: 'SPECWAVE_INIT_RETRY' }
  | { type: 'SPECWAVE_INIT_CLOSE' }
  | { type: 'SPECWAVE_INIT_COPY_ERROR' }
>;

let initSubscribed = false;

function defaultWizard(open: boolean): SpecWaveInitWizardVM {
  return {
    isOpen: open,
    phase: 'idle',
    steps: [
      { key: 'check', title: '检查环境', status: 'todo' },
      { key: 'generatePlan', title: '生成初始化计划', status: 'todo' },
      { key: 'writeFiles', title: '写入文件', status: 'todo' },
      { key: 'verify', title: '校验结果', status: 'todo' }
    ],
    progress: { percent: 0, label: '准备就绪' },
    logs: [],
    actions: { canClose: true, canRetry: false, canStart: true }
  };
}

function ensureInitSubscribed(ctx: StoreCtx) {
  if (initSubscribed) return;
  const api = window.specwave;
  if (!api?.onSpecwaveInitEvent) return;
  initSubscribed = true;

  api.onSpecwaveInitEvent((evt) => {
    if (!evt) return;

    if (evt.type === 'progress') {
      const payload = evt.payload ?? {};
      ctx.set((state) => {
        const vm = state.vm;
        const current = vm.explorer.specwaveInit ?? defaultWizard(false);
        const nextSteps = payload.step
          ? current.steps.map((s) =>
              s.key === payload.step!.key
                ? { ...s, title: payload.step!.title ?? s.title, status: payload.step!.status }
                : s
            )
          : current.steps;
        const nextLogs = payload.logAppend ? [...current.logs, payload.logAppend].slice(-120) : current.logs;
        const nextProgress = payload.progress ?? current.progress;

        const next: SpecWaveInitWizardVM = { ...current, steps: nextSteps, logs: nextLogs, progress: nextProgress };
        return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: next } } };
      });
      return;
    }

    if (evt.type === 'result') {
      const payload = evt.payload;
      if (!payload) return;

      if (payload.ok) {
        ctx.set((state) => {
          const vm = state.vm;
          const current = vm.explorer.specwaveInit ?? defaultWizard(false);
          const next: SpecWaveInitWizardVM = {
            ...current,
            phase: 'success',
            actions: { canClose: true, canRetry: false, canStart: false }
          };
          return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: next } } };
        });

        void (async () => {
          const api2 = window.specwave;
          const projectRoot = ctx.get().vm.explorer.projectRoot;
          if (!api2 || !projectRoot) return;
          const workspaceRoot = joinPath(projectRoot, '.specwave', 'workspace');
          const res = await api2.readDirectory(workspaceRoot);
          if (!res.ok) return;
          if (api2.fsWatchStart) void api2.fsWatchStart({ workspaceRoot, projectRoot });
          ctx.set((state) => ({
            vm: {
              ...state.vm,
              explorer: {
                ...state.vm.explorer,
                workspaceRoot,
                workspace: toExplorerNodes(res.entries)
              }
            }
          }));
        })();
        return;
      }

      ctx.set((state) => {
        const vm = state.vm;
        const current = vm.explorer.specwaveInit ?? defaultWizard(false);
        const next: SpecWaveInitWizardVM = {
          ...current,
          phase: 'failure',
          error: payload.error,
          actions: { canClose: true, canRetry: payload.error.canRetry, canStart: false }
        };
        return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: next } } };
      });
    }
  });
}

/**
 * SpecWave 初始化引导 handler（左栏）
 *
 * 状态迁移说明：
 * - idle：未开始，可关闭/可开始
 * - running：执行中，允许关闭（执行仍在后台继续），不可再次开始/重试
 * - success：成功，可关闭
 * - failure：失败，可关闭；按 canRetry 决定是否允许重试
 */
export function handleSpecwaveInitIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;
  const initIntent = intent as InitIntent;
  const current = vm.explorer.specwaveInit;

  switch (initIntent.type) {
    case 'SPECWAVE_INIT_OPEN': {
      ensureInitSubscribed(ctx);
      const next = current ? { ...current, isOpen: true } : defaultWizard(true);
      return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: next } } };
    }
    case 'SPECWAVE_INIT_CLOSE': {
      if (!current) return null;
      if (!current.actions.canClose) return null;
      return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: { ...current, isOpen: false } } } };
    }
    case 'SPECWAVE_INIT_COPY_ERROR': {
      const api = window.specwave;
      try {
        api?.clipboardWriteText?.(initIntent.text);
      } catch {}
      if (!current) return null;
      const appendedLog = {
        level: 'info',
        text: '已复制错误信息。',
        time: new Date().toLocaleTimeString()
      } satisfies SpecWaveInitWizardVM['logs'][number];
      const nextLogs = [...current.logs, appendedLog].slice(-120);
      return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: { ...current, logs: nextLogs } } } };
    }
    case 'SPECWAVE_INIT_RETRY': {
      ctx.dispatch({ type: 'SPECWAVE_INIT_START' });
      return null;
    }
    case 'SPECWAVE_INIT_START': {
      ensureInitSubscribed(ctx);
      const api = window.specwave;
      const projectRoot = vm.explorer.projectRoot;
      if (current?.phase === 'running') return null;
      if (!api?.specwaveInitStart) {
        const next = (current ?? defaultWizard(true));
        const failure: SpecWaveInitWizardVM = {
          ...next,
          isOpen: true,
          phase: 'failure',
          error: { title: '初始化失败', detail: '未检测到运行时初始化能力（preload 未注入）。', canRetry: true, copyText: '未检测到运行时初始化能力（preload 未注入）。' },
          actions: { canClose: true, canRetry: true, canStart: false }
        };
        return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: failure } } };
      }
      if (!projectRoot) {
        const next = (current ?? defaultWizard(true));
        const failure: SpecWaveInitWizardVM = {
          ...next,
          isOpen: true,
          phase: 'failure',
          error: { title: '初始化失败', detail: '未选择项目目录。', canRetry: true, copyText: '未选择项目目录。' },
          actions: { canClose: true, canRetry: true, canStart: false }
        };
        return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: failure } } };
      }

      void (async () => {
        const res = await api.specwaveInitStart({ projectRoot });
        if (res.ok) return;
        ctx.set((state2) => {
          const vm2 = state2.vm;
          const prev = vm2.explorer.specwaveInit ?? defaultWizard(true);
          const next: SpecWaveInitWizardVM = {
            ...prev,
            isOpen: true,
            phase: 'failure',
            error: { title: '初始化失败', detail: res.error, canRetry: true, copyText: res.error },
            actions: { canClose: true, canRetry: true, canStart: false }
          };
          return { vm: { ...vm2, explorer: { ...vm2.explorer, specwaveInit: next } } };
        });
      })();

      const next: SpecWaveInitWizardVM = {
        ...(current ?? defaultWizard(true)),
        isOpen: true,
        phase: 'running',
        error: undefined,
        actions: { canClose: true, canRetry: false, canStart: false }
      };
      return { vm: { ...vm, explorer: { ...vm.explorer, specwaveInit: next } } };
    }
    default:
      return null;
  }
}
