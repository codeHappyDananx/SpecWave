import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { applyDockDrop, applyDockSplitter, normalizeTerminalDock, setDockActiveTab } from '../shared/terminalDock';

const terminalPasteInFlight = new Set<string>();

/**
 * Terminal handler（终端面板/输入输出/剪贴板/尺寸变化）
 *
 * - 处理 intent：
 *   - TERMINAL_PANEL_CLOSE / TERMINAL_PANEL_SET_ACTIVE
 *   - TERMINAL_WRITE / TERMINAL_COPY / TERMINAL_PASTE / TERMINAL_RESIZE
 * - 读写的 VM 字段：terminal / rightVisible
 * - 副作用：preload terminalKillSession / terminalWrite / terminalResize / clipboardReadText / clipboardWriteText
 */
export function handleTerminalIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  const ensureSession = async (id: string, cols?: number | null, rows?: number | null) => {
    if (ctx.terminalSessionEnsured.has(id)) return true;
    const api = window.specwave;
    if (!api?.terminalCreateSession) return false;

    const cwd = ctx.bootProjectPath ?? ctx.get().vm.explorer.projectRoot ?? null;
    const res = await api.terminalCreateSession({ id, cwd, cols: cols ?? null, rows: rows ?? null });
    if (res.ok) {
      ctx.terminalSessionEnsured.add(id);
      try {
        api.terminalWrite?.(id, '\x1b[?2004h');
      } catch {}
      return true;
    }

    if (api.showMessageBox) {
      try {
        await api.showMessageBox({
          title: '终端启动失败',
          message: '终端会话启动失败，已关闭该面板。',
          detail: String(res.error || ''),
          buttons: ['知道了'],
          defaultId: 0
        });
      } catch {}
    }

    ctx.set((state2) => {
      const vm2 = state2.vm;
      if (!vm2.terminal.panelIds.includes(id)) return { vm: vm2 };
      const nextIds = vm2.terminal.panelIds.filter((x) => x !== id);
      const nextActive = vm2.terminal.activePanelId === id ? (nextIds[0] ?? '') : vm2.terminal.activePanelId;
      return { vm: { ...vm2, terminal: { ...vm2.terminal, panelIds: nextIds, activePanelId: nextActive } } };
    });
    ctx.terminalUserTyped.delete(id);
    ctx.terminalSessionEnsured.delete(id);
    ctx.terminalLastSizeById.delete(id);
    return false;
  };

  switch (intent.type) {
    case 'TERMINAL_PANEL_CLOSE': {
      void (async () => {
        const api = window.specwave;
        if (!api?.terminalKillSession) return;
        await api.terminalKillSession(intent.id);
      })();

      ctx.terminalUserTyped.delete(intent.id);
      ctx.terminalSessionEnsured.delete(intent.id);
      ctx.terminalLastSizeById.delete(intent.id);
      const nextIds = vm.terminal.panelIds.filter((id) => id !== intent.id);
      const nextActive = vm.terminal.activePanelId === intent.id ? (nextIds[0] ?? '') : vm.terminal.activePanelId;
      const nextDock = normalizeTerminalDock({ panelIds: nextIds, activePanelId: nextActive, dock: vm.terminal.dock });
      return {
        vm: {
          ...vm,
          terminal: { ...vm.terminal, panelIds: nextIds, activePanelId: nextActive, dock: nextDock }
        }
      };
    }
    case 'TERMINAL_PANEL_SET_ACTIVE': {
      const dock0 = setDockActiveTab({
        panelIds: vm.terminal.panelIds,
        activePanelId: intent.id,
        dock: vm.terminal.dock,
        id: intent.id
      });
      return { vm: { ...vm, terminal: { ...vm.terminal, activePanelId: intent.id, dock: dock0 }, rightVisible: true } };
    }
    case 'TERMINAL_DOCK_SPLITTER_SET': {
      const dock0 = normalizeTerminalDock({ panelIds: vm.terminal.panelIds, activePanelId: vm.terminal.activePanelId, dock: vm.terminal.dock });
      const dock1 = applyDockSplitter({ dock: dock0, key: intent.key, ratio: intent.ratio });
      return { vm: { ...vm, terminal: { ...vm.terminal, dock: dock1 } } };
    }
    case 'TERMINAL_DOCK_DROP': {
      const dock0 = normalizeTerminalDock({ panelIds: vm.terminal.panelIds, activePanelId: vm.terminal.activePanelId, dock: vm.terminal.dock });
      const dock1 = applyDockDrop({
        panelIds: vm.terminal.panelIds,
        activePanelId: vm.terminal.activePanelId,
        dock: dock0,
        id: intent.id,
        drop: intent.drop
      });
      return { vm: { ...vm, terminal: { ...vm.terminal, activePanelId: intent.id, dock: dock1 }, rightVisible: true } };
    }
    case 'TERMINAL_WRITE': {
      const api = window.specwave;
      if (!api?.terminalWrite) return { vm };
      ctx.terminalUserTyped.add(intent.id);
      if (ctx.terminalSessionEnsured.has(intent.id)) {
        api.terminalWrite(intent.id, intent.data);
        return { vm };
      }

      void (async () => {
        const size = ctx.terminalLastSizeById.get(intent.id);
        const ok = await ensureSession(intent.id, size?.cols ?? null, size?.rows ?? null);
        if (!ok) return;
        try {
          api.terminalWrite(intent.id, intent.data);
        } catch {}
      })();
      return { vm };
    }
    case 'TERMINAL_COPY': {
      const api = window.specwave;
      const text = intent.text ?? '';
      const candidate = text;

      let ok = false;
      if (api?.clipboardWriteText) {
        try {
          api.clipboardWriteText(candidate);
          ok = true;
          if (api.clipboardReadText) {
            try {
              const roundtrip = api.clipboardReadText();
              if (roundtrip !== candidate) ok = false;
            } catch {}
          }
        } catch {}
      }

      if (!ok) {
        const canNavigatorClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);
        const canDomCopy = typeof document !== 'undefined' && typeof document.execCommand === 'function';

        if (canNavigatorClipboard) {
          void navigator.clipboard!.writeText(candidate).catch(() => {
            if (!canDomCopy) return;
            try {
              const textarea = document.createElement('textarea');
              textarea.value = candidate;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'fixed';
              textarea.style.left = '-9999px';
              textarea.style.top = '0';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
            } catch {}
          });
        } else if (canDomCopy) {
          try {
            const textarea = document.createElement('textarea');
            textarea.value = candidate;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          } catch {}
        }
      }
      return { vm };
    }
    case 'TERMINAL_PASTE': {
      void (async () => {
        const api = window.specwave;
        if (!api?.terminalWrite) return;
        if (terminalPasteInFlight.has(intent.id)) return;
        terminalPasteInFlight.add(intent.id);
        try {
          let pasted = false;
          if (api.terminalPasteImage) {
            try {
              const cwd = ctx.bootProjectPath ?? ctx.get().vm.explorer.projectRoot ?? null;
              const result = await api.terminalPasteImage({ cwd, prefix: 'img-' });
              if (result?.ok) {
                const outputPath = result.filePath || result.fileName;
                if (outputPath) {
                  api.terminalWrite(intent.id, outputPath);
                  pasted = true;
                }
              }
            } catch {}
          }

          if (!pasted && api.clipboardReadFilePaths) {
            try {
              const filePaths = api.clipboardReadFilePaths();
              if (filePaths.length > 0) {
                const joined = filePaths.join('\n');
                const normalized = joined.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
                api.terminalWrite(intent.id, normalized);
                pasted = true;
              }
            } catch {}
          }

          if (pasted) return;

          let text = api.clipboardReadText?.() ?? '';
          if (!text) {
            const canNavigatorClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
            if (canNavigatorClipboard) {
              try {
                text = await navigator.clipboard!.readText();
              } catch {}
            }
          }
          if (!text) return;
          // 与 xterm 内部粘贴口径对齐：把所有换行归一为 '\r'，避免 Windows 下出现“看起来没粘贴”的错觉。
          // 参考：`@xterm/xterm` 的 prepareTextForTerminal（把 \r?\n 统一成 \r）。
          text = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
          api.terminalWrite(intent.id, text);
        } catch {}
        finally {
          window.setTimeout(() => {
            terminalPasteInFlight.delete(intent.id);
          }, 120);
        }
      })();
      return { vm };
    }
    case 'TERMINAL_RESIZE': {
      const api = window.specwave;
      if (!api?.terminalResize) return { vm };
      ctx.terminalLastSizeById.set(intent.id, { cols: intent.cols, rows: intent.rows });

      if (ctx.terminalSessionEnsured.has(intent.id)) {
        api.terminalResize(intent.id, intent.cols, intent.rows);
        return { vm };
      }

      void (async () => {
        const ok = await ensureSession(intent.id, intent.cols, intent.rows);
        if (!ok) return;
        try {
          api.terminalResize(intent.id, intent.cols, intent.rows);
        } catch {}
      })();
      return { vm };
    }
    default:
      return null;
  }
}
