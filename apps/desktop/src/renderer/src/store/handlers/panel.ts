import type { ChatMessageVM, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { normalizeLayoutStable } from '../shared/layout';
import { normalizeTerminalDock } from '../shared/terminalDock';

const msg = (who: ChatMessageVM['who'], text: string): ChatMessageVM => ({ who, text });

/**
 * Panel handler（面板与视图）
 *
 * - 处理 intent：
 *   - PANEL_TOGGLE_LEFT / PANEL_TOGGLE_CENTER / PANEL_TOGGLE_RIGHT
 *   - RIGHT_MODE_SET / LEFT_VIEW_MODE_SET
 *   - RIGHT_PANEL_ADD
 * - 读写的 VM 字段：
 *   - leftVisible / centerVisible / rightVisible / rightMode / leftViewMode
 *   - layout（仅通过 normalizeLayoutStable 做归一化）
 *   - terminal（新增 panelId、activePanelId）
 *   - chat（新增 sessionId、activeSessionId、messagesBySession、draftBySession）
 * - 边界：
 *   - 关闭 center 时强制打开 right 且切到 terminal，保证工作区仍有可用输出面板。
 */
export function handlePanelIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'PANEL_TOGGLE_CENTER': {
      const nextCenterVisible = !vm.centerVisible;
      if (!nextCenterVisible) {
        const nextVm = {
          ...vm,
          centerVisible: false,
          // 中区关闭后优先展示终端；右区仍允许被用户手动关闭。
          rightVisible: true,
          rightMode: 'terminal' as const
        };
        const nextLayout = normalizeLayoutStable(nextVm);
        return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
      }
      const nextVm = { ...vm, centerVisible: true };
      const nextLayout = normalizeLayoutStable(nextVm);
      return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
    }
    case 'PANEL_TOGGLE_LEFT': {
      const nextVm = { ...vm, leftVisible: !vm.leftVisible };
      const nextLayout = normalizeLayoutStable(nextVm);
      return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
    }
    case 'PANEL_TOGGLE_RIGHT': {
      const nextVm = { ...vm, rightVisible: !vm.rightVisible };
      const nextLayout = normalizeLayoutStable(nextVm);
      return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
    }
    case 'RIGHT_MODE_SET': {
      const nextVm = { ...vm, rightMode: intent.mode, rightVisible: true };
      const nextLayout = normalizeLayoutStable(nextVm);
      return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
    }
    case 'LEFT_VIEW_MODE_SET':
      return { vm: { ...vm, leftViewMode: intent.mode } };
    case 'RIGHT_PANEL_ADD': {
      if (vm.rightMode === 'terminal') {
        const nextId = `terminal-${Date.now()}`;
        ctx.terminalUserTyped.delete(nextId);
        const nextPanelIds = [...vm.terminal.panelIds, nextId];
        const dock0 = normalizeTerminalDock({ panelIds: vm.terminal.panelIds, activePanelId: vm.terminal.activePanelId, dock: vm.terminal.dock });
        const activeRegionId =
          dock0.regions.find((r) => r.tabIds.includes(vm.terminal.activePanelId))?.id ?? dock0.regions[0]?.id ?? 'A';
        const dock1 = normalizeTerminalDock({
          panelIds: nextPanelIds,
          activePanelId: nextId,
          dock: {
            ...dock0,
            regions: dock0.regions.map((r) =>
              r.id === activeRegionId ? { ...r, tabIds: [...r.tabIds, nextId], activeTabId: nextId } : r
            )
          }
        });

        return {
          vm: {
            ...vm,
            terminal: {
              panelIds: nextPanelIds,
              activePanelId: nextId,
              dock: dock1,
            },
            rightVisible: true
          }
        };
      }

      const nextId = `chat-${vm.chat.sessionIds.length + 1}`;
      return {
        vm: {
          ...vm,
          chat: {
            ...vm.chat,
            sessionIds: [...vm.chat.sessionIds, nextId],
            activeSessionId: nextId,
            messagesBySession: {
              ...vm.chat.messagesBySession,
              [nextId]: [msg('AI', '新会话已创建（示意）。')]
            },
            draftBySession: { ...vm.chat.draftBySession, [nextId]: '' }
          },
          rightVisible: true
        }
      };
    }
    default:
      return null;
  }
}
