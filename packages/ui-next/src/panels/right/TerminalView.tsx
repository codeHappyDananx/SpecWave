import React, { useEffect, useMemo, useRef } from 'react';
import type { AppViewModel, UIIntent } from '@specwave/contracts';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { SubscribeTerminalEvent, TerminalEvent } from '../../shell/ports';
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
  subscribeTerminalEvent?: SubscribeTerminalEvent;
  visible: boolean;
};

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

export function TerminalView(props: TerminalViewProps) {
  const MAX_WRITE_CHARS = 24_000;

  const activeId = props.terminal.activePanelId;
  const dispatchRef = useRef(props.dispatch);
  const hostRef = useRef<HTMLDivElement | null>(null);

  type TermInstance = {
    id: string;
    term: Terminal;
    fit: FitAddon;
    container: HTMLDivElement | null;
    isOpen: boolean;
    lastSize: { cols: number; rows: number } | null;
    writeQueue: string[];
    writeInFlight: boolean;
    lastPasteRequestAt: number;
    pasteTarget: HTMLTextAreaElement | null;
    pasteHandler: ((event: ClipboardEvent) => void) | null;
    dispose: () => void;
  };

  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const containerRefFnById = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const pendingByIdRef = useRef<Map<string, string[]>>(new Map());
  const flushRafRef = useRef<number | null>(null);
  const prevPanelIdsRef = useRef<string[]>([]);
  const panelIdSetRef = useRef<Set<string>>(new Set());

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
    dispatchRef.current = props.dispatch;
  }, [props.dispatch]);

  React.useLayoutEffect(() => {
    panelIdSetRef.current = new Set(props.terminal.panelIds);
  }, [props.terminal.panelIds]);

  const copySelectionFrom = React.useCallback((term: Terminal) => {
    if (!term.hasSelection()) return false;
    const text = term.getSelection();
    if (!text) {
      try {
        term.clearSelection();
      } catch {}
      return false;
    }
    dispatchRef.current({ type: 'TERMINAL_COPY', text });
    try {
      term.clearSelection();
    } catch {}
    return true;
  }, []);

  const pasteFromClipboardFor = React.useCallback((id: string, term?: Terminal) => {
    if (!id) return;
    dispatchRef.current({ type: 'TERMINAL_PASTE', id });
    try {
      term?.focus();
    } catch {}
  }, []);

  const enqueueWriteFor = React.useCallback((inst: TermInstance, text: string) => {
    if (!text) return;
    inst.writeQueue.push(text);

    const flush = () => {
      if (inst.writeInFlight) return;
      const next = inst.writeQueue.shift();
      if (!next) return;

      let head = next;
      let rest = '';
      if (head.length > MAX_WRITE_CHARS) {
        rest = head.slice(MAX_WRITE_CHARS);
        head = head.slice(0, MAX_WRITE_CHARS);
      }

      inst.writeInFlight = true;
      inst.term.write(head, () => {
        inst.writeInFlight = false;
        if (rest) inst.writeQueue.unshift(rest);
        if (inst.writeQueue.length > 0) window.setTimeout(flush, 0);
      });
    };

    window.setTimeout(flush, 0);
  }, []);

  const ensureInstance = React.useCallback(
    (id: string) => {
      const hit = instancesRef.current.get(id);
      if (hit) return hit;

      const css = getComputedStyle(document.documentElement);
      const termTheme = {
        background: cssVar(css, '--sw-terminal-bg', '#0F172A'),
        foreground: cssVar(css, '--sw-terminal-fg', '#F1F5F9'),
        cursor: cssVar(css, '--sw-terminal-cursor', '#3B82F6'),
        selectionBackground: cssVar(css, '--sw-terminal-selection', 'rgba(59, 130, 246, 0.28)')
      };
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'Consolas, "Cascadia Mono", "JetBrains Mono", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.05,
        letterSpacing: 0,
        scrollback: 10000,
        convertEol: true,
        theme: termTheme,
        rightClickSelectsWord: false,
        allowProposedApi: false
      });
      const fit = new FitAddon();
      term.loadAddon(fit);

      const onData = term.onData((data) => {
        dispatchRef.current({ type: 'TERMINAL_WRITE', id, data });
      });

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
        const isCopyShortcut =
          (ctrl && shift && !alt && !meta && code === 'KeyC') || (ctrl && !shift && !alt && !meta && code === 'Insert');
        const isPasteShortcut =
          (ctrl && !alt && !meta && code === 'KeyV') || (shift && !ctrl && !alt && !meta && code === 'Insert');
        const isShiftEnter =
          shift && !ctrl && !alt && !meta && (code === 'Enter' || code === 'NumpadEnter' || e.key === 'Enter');

        if (isShiftEnter) {
          // 发送 CSI u 的 Shift+Enter，让支持的终端把它当作“插入换行”
          dispatchRef.current({ type: 'TERMINAL_WRITE', id, data: '\x1b[13;2u' });
          return false;
        }

        if (isPasteShortcut) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const inst2 = instancesRef.current.get(id);
          if (inst2) inst2.lastPasteRequestAt = now;
          pasteFromClipboardFor(id, term);
          return false;
        }

        if (isCopyShortcut) {
          copySelectionFrom(term);
          return false;
        }

        if (isCtrlC) {
          const didCopy = copySelectionFrom(term);
          if (didCopy) return false;
          return true;
        }

        return true;
      });

      const inst: TermInstance = {
        id,
        term,
        fit,
        container: null,
        isOpen: false,
        lastSize: null,
        writeQueue: [],
        writeInFlight: false,
        lastPasteRequestAt: 0,
        pasteTarget: null,
        pasteHandler: null,
        dispose: () => {
          try {
            onData.dispose();
          } catch {}
          if (inst.pasteTarget && inst.pasteHandler) {
            try {
              inst.pasteTarget.removeEventListener('paste', inst.pasteHandler, true);
            } catch {}
          }
          try {
            term.dispose();
          } catch {}
        }
      };

      instancesRef.current.set(id, inst);
      return inst;
    },
    [copySelectionFrom, pasteFromClipboardFor, enqueueWriteFor]
  );

  const fitAndResize = React.useCallback(
    (id: string) => {
      const inst = instancesRef.current.get(id);
      if (!inst || !inst.isOpen) return;
      try {
        inst.fit.fit();
      } catch {
        return;
      }
      const cols = inst.term.cols;
      const rows = inst.term.rows;
      const last = inst.lastSize;
      if (last && last.cols === cols && last.rows === rows) return;
      inst.lastSize = { cols, rows };
      dispatchRef.current({ type: 'TERMINAL_RESIZE', id, cols, rows });
    },
    []
  );

  const ensurePasteHandler = React.useCallback(
    (inst: TermInstance) => {
      const target =
        inst.term.textarea ??
        ((inst.container?.querySelector?.('textarea') as HTMLTextAreaElement | null) ?? null);
      if (!target) return;
      if (inst.pasteTarget === target && inst.pasteHandler) return;

      if (inst.pasteTarget && inst.pasteHandler) {
        try {
          inst.pasteTarget.removeEventListener('paste', inst.pasteHandler, true);
        } catch {}
      }

      const handler = (event: ClipboardEvent) => {
        try {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        } catch {}

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - inst.lastPasteRequestAt < 80) return;
        inst.lastPasteRequestAt = now;
        pasteFromClipboardFor(inst.id, inst.term);
      };

      target.addEventListener('paste', handler, true);
      inst.pasteTarget = target;
      inst.pasteHandler = handler;
    },
    [pasteFromClipboardFor]
  );

  const setContainerFor = React.useCallback(
    (id: string, el: HTMLDivElement | null) => {
      const inst = instancesRef.current.get(id) ?? ensureInstance(id);
      inst.container = el;
      if (!el || inst.isOpen) return;

      el.innerHTML = '';
      inst.term.open(el);
      inst.isOpen = true;
      ensurePasteHandler(inst);

      if (props.visible && id === activeId) {
        try {
          inst.term.focus();
        } catch {}
        requestAnimationFrame(() => fitAndResize(id));
      }
    },
    [activeId, ensureInstance, ensurePasteHandler, fitAndResize, props.visible]
  );

  const getContainerRef = React.useCallback(
    (id: string) => {
      const hit = containerRefFnById.current.get(id);
      if (hit) return hit;
      const fn = (el: HTMLDivElement | null) => setContainerFor(id, el);
      containerRefFnById.current.set(id, fn);
      return fn;
    },
    [setContainerFor]
  );

  React.useLayoutEffect(() => {
    if (!hasPanels) return;

    const nextIds = props.terminal.panelIds;
    const prevIds = prevPanelIdsRef.current;
    prevPanelIdsRef.current = nextIds.slice();

    for (const id of nextIds) ensureInstance(id);

    for (const [id, inst] of instancesRef.current.entries()) {
      if (nextIds.includes(id)) continue;
      try {
        inst.dispose();
      } catch {}
      instancesRef.current.delete(id);
      containerRefFnById.current.delete(id);
      pendingByIdRef.current.delete(id);
    }

    const prevSet = new Set(prevIds);
    for (const id of nextIds) {
      if (prevSet.has(id)) continue;
      const inst = instancesRef.current.get(id);
      if (!inst) continue;
      enqueueWriteFor(inst, '正在启动终端…\r\n');
    }
  }, [ensureInstance, enqueueWriteFor, hasPanels, props.terminal.panelIds]);

  const scheduleFlushPending = React.useCallback(() => {
    if (flushRafRef.current != null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      for (const [id, parts] of pendingByIdRef.current.entries()) {
        if (!parts.length) continue;
        const inst = instancesRef.current.get(id);
        if (!inst) continue;
        pendingByIdRef.current.set(id, []);
        enqueueWriteFor(inst, parts.join(''));
      }
    });
  }, [enqueueWriteFor]);

  React.useLayoutEffect(() => {
    const subscribe = props.subscribeTerminalEvent;
    if (!subscribe) return;
    const unsub = subscribe((evt: TerminalEvent) => {
      if (!panelIdSetRef.current.has(evt.id)) return;

      let payload = '';
      if (evt.type === 'data') payload = evt.data ?? '';
      if (evt.type === 'exit') payload = `\r\n[进程已退出] exitCode=${evt.exitCode}${evt.signal ? ` signal=${evt.signal}` : ''}\r\n`;
      if (evt.type === 'error') payload = `\r\n[终端错误] ${evt.error}\r\n`;
      if (!payload) return;

      const list = pendingByIdRef.current.get(evt.id) ?? [];
      list.push(payload);
      pendingByIdRef.current.set(evt.id, list);
      scheduleFlushPending();
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [props.subscribeTerminalEvent, scheduleFlushPending]);

  useEffect(() => {
    if (!hasPanels) return;
    const inst = instancesRef.current.get(activeId);
    if (!inst) return;
    if (!props.visible) return;
    try {
      inst.term.focus();
    } catch {}
    requestAnimationFrame(() => fitAndResize(activeId));
  }, [activeId, fitAndResize, hasPanels, props.visible]);

  useEffect(() => {
    if (!hasPanels) return;
    if (!props.visible) return;
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => fitAndResize(activeId));
    ro.observe(host);
    return () => ro.disconnect();
  }, [activeId, fitAndResize, hasPanels, props.visible]);

  useEffect(() => {
    return () => {
      if (flushRafRef.current != null) cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
      for (const inst of instancesRef.current.values()) {
        try {
          inst.dispose();
        } catch {}
      }
      instancesRef.current.clear();
      containerRefFnById.current.clear();
      pendingByIdRef.current.clear();
    };
  }, []);

  if (!hasPanels) return emptyHint;

  const onContextMenu = (e: React.MouseEvent) => {
    if (!props.visible) return;
    e.preventDefault();
    const inst = instancesRef.current.get(activeId);
    if (!inst) return;
    const didCopy = copySelectionFrom(inst.term);
    if (didCopy) return;
    pasteFromClipboardFor(activeId, inst.term);
  };

  return (
    <div className={styles.root} aria-label="终端面板">
      <div className={styles.pad} aria-label="终端内边距">
        <div
          ref={hostRef}
          className={styles.sessionStack}
          aria-label="终端输出"
          onContextMenu={onContextMenu}
        >
          {props.terminal.panelIds.map((id) => (
            <div
              key={id}
              ref={getContainerRef(id)}
              className={styles.session}
              data-active={id === activeId ? '1' : '0'}
              aria-label={`终端实例 ${id}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
