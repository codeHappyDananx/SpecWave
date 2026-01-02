import React, { useEffect, useMemo, useRef } from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalView.module.css';

type TerminalIntent = Extract<UIIntent, { type: 'TERMINAL_WRITE' } | { type: 'TERMINAL_RESIZE' }>;

export type TerminalViewProps = {
  terminal: AppViewModel['terminal'];
  dispatch: (intent: TerminalIntent) => void;
};

const termTheme = {
  background: '#0B1020',
  foreground: '#E5E7EB',
  cursor: '#E5E7EB',
  selectionBackground: 'rgba(59,130,246,.35)'
};

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
          <div>还没有终端面板</div>
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

    const start = writtenRef.current[activeId] ?? 0;
    if (chunks.length <= start) return;
    const next = chunks.slice(start);
    writtenRef.current[activeId] = chunks.length;
    for (const c of next) term.write(c);
  }, [activeId, chunks, hasPanels]);

  if (!hasPanels) return emptyHint;

  return (
    <div className={styles.root} aria-label="终端面板">
      <div ref={containerRef} className={styles.xtermHost} aria-label="终端输出" />
    </div>
  );
}
