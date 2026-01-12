import type { UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';

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

  switch (intent.type) {
    case 'TERMINAL_PANEL_CLOSE': {
      void (async () => {
        const api = window.specwave;
        if (!api?.terminalKillSession) return;
        await api.terminalKillSession(intent.id);
      })();

      ctx.terminalUserTyped.delete(intent.id);
      const nextIds = vm.terminal.panelIds.filter((id) => id !== intent.id);
      const nextActive = vm.terminal.activePanelId === intent.id ? (nextIds[0] ?? '') : vm.terminal.activePanelId;
      return {
        vm: {
          ...vm,
          terminal: { ...vm.terminal, panelIds: nextIds, activePanelId: nextActive }
        }
      };
    }
    case 'TERMINAL_PANEL_SET_ACTIVE':
      return { vm: { ...vm, terminal: { ...vm.terminal, activePanelId: intent.id }, rightVisible: true } };
    case 'TERMINAL_WRITE': {
      const api = window.specwave;
      if (!api?.terminalWrite) return { vm };
      ctx.terminalUserTyped.add(intent.id);
      api.terminalWrite(intent.id, intent.data);
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
        try {
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
      })();
      return { vm };
    }
    case 'TERMINAL_RESIZE': {
      const api = window.specwave;
      if (!api?.terminalResize) return { vm };
      api.terminalResize(intent.id, intent.cols, intent.rows);
      return { vm };
    }
    default:
      return null;
  }
}
