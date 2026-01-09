import React, { useEffect, useMemo, useRef } from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalView.module.css';

type TerminalIntent = Extract<
  UIIntent,
  | { type: 'TERMINAL_WRITE' }
  | { type: 'TERMINAL_RESIZE' }
  | { type: 'TERMINAL_COPY' }
  | { type: 'TERMINAL_PASTE' }
>;

export type TerminalViewProps = {
  terminal: AppViewModel['terminal'];
  dispatch: (intent: TerminalIntent) => void;
};

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

export function TerminalView(props: TerminalViewProps) {
  const activeId = props.terminal.activePanelId;
  const chunks = props.terminal.outputByPanel[activeId] ?? [];
  const dispatch = props.dispatch;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef<Record<string, number>>({});

  const hasPanels = props.terminal.panelIds.length > 0;
  const emptyHint = useMemo(
    () => (
      <div className={styles.root} aria-label="终端空态">
        <div className={styles.emptyHint} aria-label="终端提示">
          <div className={styles.emptyHintTitle}>还没有终端面板</div>
          <div className={styles.emptyHintMuted}>点击右上角 “+” 新建一个终端</div>
        </div>
      </div>
    ),
    []
  );

  useEffect(() => {
    if (!hasPanels) return;
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = '';
    const css = getComputedStyle(el);
    const termTheme = {
      background: cssVar(css, '--sw-terminal-bg', '#0F172A'),
      foreground: cssVar(css, '--sw-terminal-fg', '#F1F5F9'),
      cursor: cssVar(css, '--sw-terminal-cursor', '#3B82F6'),
      selectionBackground: cssVar(css, '--sw-terminal-selection', 'rgba(59, 130, 246, 0.28)')
    };
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'var(--sw-font-mono)',
      fontSize: 12,
      lineHeight: 1.25,
      theme: termTheme,
      allowProposedApi: false
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    term.focus();

    termRef.current = term;
    fitRef.current = fit;
    writtenRef.current[activeId] = 0;

    const onData = term.onData((data) => {
      dispatch({ type: 'TERMINAL_WRITE', id: activeId, data });
    });

    const copySelection = () => {
      if (!term.hasSelection()) return false;
      const text = term.getSelection();
      if (!text) return false;
      dispatch({ type: 'TERMINAL_COPY', text });
      try {
        term.clearSelection();
      } catch {}
      return true;
    };

    const pasteFromClipboard = () => {
      dispatch({ type: 'TERMINAL_PASTE', id: activeId });
      try {
        term.focus();
      } catch {}
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (term.hasSelection()) {
        copySelection();
        return;
      }
      pasteFromClipboard();
    };

    el.addEventListener('contextmenu', onContextMenu);

    // Windows 常用：Ctrl+Shift+C/V、Ctrl+Insert、Shift+Insert
    // 额外口径：Ctrl+C 有选区时复制；无选区时按“中断”处理（交给终端/pty）。
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (e.defaultPrevented) return true;
      if (e.isComposing) return true;

      const ctrl = e.ctrlKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const meta = e.metaKey;
      const code = e.code;

      const isCtrlC = ctrl && !shift && !alt && !meta && code === 'KeyC';
      const isCopyShortcut = (ctrl && shift && !alt && !meta && code === 'KeyC') || (ctrl && !shift && !alt && !meta && code === 'Insert');
      const isPasteShortcut =
        (ctrl && shift && !alt && !meta && code === 'KeyV') || (shift && !ctrl && !alt && !meta && code === 'Insert');

      if (isPasteShortcut) {
        pasteFromClipboard();
        return false;
      }

      if (isCopyShortcut) {
        const didCopy = copySelection();
        if (didCopy) return false;
        return false;
      }

      if (isCtrlC) {
        const didCopy = copySelection();
        if (didCopy) return false;
        // 无选区：交给终端本身处理（通常是中断/停止当前命令）。
        return true;
      }

      return true;
    });

    let raf = 0;
    const runFit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fit.fit();
        dispatch({ type: 'TERMINAL_RESIZE', id: activeId, cols: term.cols, rows: term.rows });
      });
    };

    const ro = new ResizeObserver(runFit);
    ro.observe(el);
    runFit();

    return () => {
      ro.disconnect();
      onData.dispose();
      cancelAnimationFrame(raf);
      el.removeEventListener('contextmenu', onContextMenu);
      try {
        term.dispose();
      } catch {}
      termRef.current = null;
      fitRef.current = null;
    };
  }, [activeId, dispatch, hasPanels]);

  useEffect(() => {
    if (!hasPanels) return;
    const term = termRef.current;
    if (!term) return;

    let start = writtenRef.current[activeId] ?? 0;
    // 输出被裁剪/重置时，writtenRef 可能大于当前 chunks；需要把终端内容同步回“当前缓存”的样子。
    if (start > chunks.length) {
      start = 0;
      writtenRef.current[activeId] = 0;
      try {
        (term as any).reset?.();
      } catch {}
      try {
        term.clear();
      } catch {}
    }
    if (chunks.length <= start) return;
    const next = chunks.slice(start);
    writtenRef.current[activeId] = chunks.length;
    for (const c of next) term.write(c);
  }, [activeId, chunks, hasPanels]);

  if (!hasPanels) return emptyHint;

  return (
    <div className={styles.root} aria-label="终端面板">
      <div className={styles.pad} aria-label="终端内边距">
        <div ref={containerRef} className={styles.xtermHost} aria-label="终端输出" />
      </div>
    </div>
  );
}
