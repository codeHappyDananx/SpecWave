import type { AppViewModel, UIIntent } from '@specwave/contracts';

import type { DragSnapshot } from './shared/layout';

export type AppState = {
  vm: AppViewModel;
  intentLog: string[];
  drag: DragSnapshot | null;
  dispatch: (intent: UIIntent) => void;
};

export type StoreCtx = {
  set: (partial: AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>), replace?: boolean) => void;
  get: () => AppState;
  dispatch: (intent: UIIntent) => void;
  terminalUserTyped: Set<string>;
  terminalSessionEnsured: Set<string>;
  terminalLastSizeById: Map<string, { cols: number; rows: number }>;
  specwaveWindowKind: 'welcome' | 'main';
  bootProjectPath: string | null;
  initialVm: AppViewModel;
};

export type HandlerResult = Partial<AppState> | void;
