import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from './types';
import { handlePanelIntent } from './handlers/panel';
import { handleLayoutIntent } from './handlers/layout';
import { handleThemeIntent } from './handlers/theme';
import { handleProjectIntent } from './handlers/project';
import { handleExplorerIntent } from './handlers/explorer';
import { handleSpecwaveInitIntent } from './handlers/specwaveInit';
import { handleTaskIntent } from './handlers/task';
import { handleTerminalIntent } from './handlers/terminal';
import { handleContentIntent } from './handlers/content';
import { handleCodexCapabilitiesIntent } from './handlers/codexCapabilities';

export function dispatchByHandlers(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  return (
    handlePanelIntent(args) ??
    handleLayoutIntent(args) ??
    handleThemeIntent(args) ??
    handleProjectIntent(args) ??
    handleCodexCapabilitiesIntent(args) ??
    handleSpecwaveInitIntent(args) ??
    handleExplorerIntent(args) ??
    handleTaskIntent(args) ??
    handleTerminalIntent(args) ??
    handleContentIntent(args) ??
    null
  );
}
