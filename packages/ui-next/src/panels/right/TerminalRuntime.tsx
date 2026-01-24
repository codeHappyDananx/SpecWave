import React, { useEffect, useMemo, useRef } from 'react';
import type { UIIntent } from '@specwave/contracts';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { SubscribeTerminalEvent, TerminalEvent } from '../../shell/ports';
import styles from './TerminalRuntime.module.css';

type TerminalIntent = Extract<
  UIIntent,
  | { type: 'TERMINAL_WRITE' }
  | { type: 'TERMINAL_RESIZE' }
  | { type: 'TERMINAL_COPY' }
  | { type: 'TERMINAL_PASTE' }
>;

export type TerminalRuntimeProps = {
  panelIds: string[];
  visibleIds: string[];
  focusedId: string | null;
  mountById: Map<string, HTMLDivElement | null>;
  dispatch: (intent: TerminalIntent) => void;
  subscribeTerminalEvent?: SubscribeTerminalEvent;
  visible: boolean;
};

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string) {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

export function TerminalRuntime(props: TerminalRuntimeProps) {
  const MAX_WRITE_CHARS = 24_000;

  const dispatchRef = useRef(props.dispatch);
  const poolRef = useRef<HTMLDivElement | null>(null);

  type TermInstance = {
    id: string;
    term: Terminal;
    fit: FitAddon;
    rootEl: HTMLDivElement;
    isOpen: boolean;
    lastSize: { cols: number; rows: number } | null;
    writeQueue: string[];
    writeInFlight: boolean;
    lastPasteRequestAt: number;
    pasteTarget: HTMLTextAreaElement | null;
    pasteHandler: ((event: ClipboardEvent) => void) | null;
    ro: ResizeObserver | null;
    dispose: () => void;
  };

  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const pendingByIdRef = useRef<Map<string, string[]>>(new Map());
  const flushRafRef = useRef<number | null>(null);
  const panelIdSetRef = useRef<Set<string>>(new Set());

  const hasPanels = props.panelIds.length > 0;

  useEffect(() => {
    dispatchRef.current = props.dispatch;
  }, [props.dispatch]);

  React.useLayoutEffect(() => {
    panelIdSetRef.current = new Set(props.panelIds);
  }, [props.panelIds]);

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

  const ensurePasteHandler = React.useCallback(
    (inst: TermInstance) => {
      const target =
        inst.term.textarea ?? ((inst.rootEl.querySelector?.('textarea') as HTMLTextAreaElement | null) ?? null);
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

  const fitAndResize = React.useCallback((id: string) => {
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
  }, []);

  const ensureInstance = React.useCallback(
    (id: string) => {
      const hit = instancesRef.current.get(id);
      if (hit) return hit;

      const rootEl = document.createElement('div');
      rootEl.className = styles.sessionHost ?? '';

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

      const onContextMenu = (e: MouseEvent) => {
        if (!props.visible) return;
        try {
          e.preventDefault();
        } catch {}
        const inst2 = instancesRef.current.get(id);
        if (!inst2) return;
        const didCopy = copySelectionFrom(inst2.term);
        if (didCopy) return;
        pasteFromClipboardFor(id, inst2.term);
      };
      rootEl.addEventListener('contextmenu', onContextMenu);

      const inst: TermInstance = {
        id,
        term,
        fit,
        rootEl,
        isOpen: false,
        lastSize: null,
        writeQueue: [],
        writeInFlight: false,
        lastPasteRequestAt: 0,
        pasteTarget: null,
        pasteHandler: null,
        ro: null,
        dispose: () => {
          if (inst.ro) {
            try {
              inst.ro.disconnect();
            } catch {}
          }
          try {
            rootEl.removeEventListener('contextmenu', onContextMenu);
          } catch {}
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
          try {
            rootEl.remove();
          } catch {}
        }
      };

      instancesRef.current.set(id, inst);
      return inst;
    },
    [copySelectionFrom, ensurePasteHandler, fitAndResize, pasteFromClipboardFor, props.visible]
  );

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
    if (!hasPanels) return;
    const nextIds = props.panelIds;
    for (const id of nextIds) ensureInstance(id);

    for (const [id, inst] of instancesRef.current.entries()) {
      if (nextIds.includes(id)) continue;
      try {
        inst.dispose();
      } catch {}
      instancesRef.current.delete(id);
      pendingByIdRef.current.delete(id);
    }
  }, [ensureInstance, hasPanels, props.panelIds]);

  React.useLayoutEffect(() => {
    const pool = poolRef.current;
    if (!pool) return;
    if (!hasPanels) return;

    const visibleSet = new Set(props.visibleIds);
    for (const id of props.panelIds) {
      const inst = instancesRef.current.get(id);
      if (!inst) continue;

      const isVisible = visibleSet.has(id) && props.visible;
      const mount = isVisible ? props.mountById.get(id) ?? null : null;

      if (isVisible && mount) {
        if (!inst.isOpen) {
          try {
            mount.replaceChildren(inst.rootEl);
          } catch {
            try {
              mount.innerHTML = '';
              mount.appendChild(inst.rootEl);
            } catch {}
          }
          try {
            inst.term.open(inst.rootEl);
            inst.isOpen = true;
            ensurePasteHandler(inst);
          } catch {}
        } else {
        try {
          mount.replaceChildren(inst.rootEl);
        } catch {
          try {
            mount.innerHTML = '';
            mount.appendChild(inst.rootEl);
          } catch {}
        }
        }
        if (!inst.ro) inst.ro = new ResizeObserver(() => fitAndResize(id));
        try {
          inst.ro.disconnect();
          inst.ro.observe(mount);
        } catch {}
        requestAnimationFrame(() => fitAndResize(id));
      } else {
        if (inst.ro) {
          try {
            inst.ro.disconnect();
          } catch {}
        }
        if (inst.isOpen) {
          try {
            pool.appendChild(inst.rootEl);
          } catch {}
        }
      }
    }
  }, [ensurePasteHandler, fitAndResize, hasPanels, props.mountById, props.panelIds, props.visible, props.visibleIds]);

  React.useLayoutEffect(() => {
    if (!hasPanels) return;
    if (!props.visible) return;
    const id = props.focusedId ?? '';
    if (!id) return;
    const inst = instancesRef.current.get(id);
    if (!inst || !inst.isOpen) return;
    try {
      inst.term.focus();
    } catch {}
    requestAnimationFrame(() => fitAndResize(id));
  }, [fitAndResize, hasPanels, props.focusedId, props.visible]);

  React.useLayoutEffect(() => {
    const subscribe = props.subscribeTerminalEvent;
    if (!subscribe) return;
    const unsub = subscribe((evt: TerminalEvent) => {
      if (!panelIdSetRef.current.has(evt.id)) return;

      let payload = '';
      if (evt.type === 'data') payload = evt.data ?? '';
      if (evt.type === 'exit')
        payload = `\r\n[进程已退出] exitCode=${evt.exitCode}${evt.signal ? ` signal=${evt.signal}` : ''}\r\n`;
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
    return () => {
      if (flushRafRef.current != null) cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
      for (const inst of instancesRef.current.values()) {
        try {
          inst.dispose();
        } catch {}
      }
      instancesRef.current.clear();
      pendingByIdRef.current.clear();
    };
  }, []);

  const pool = useMemo(() => <div ref={poolRef} className={styles.pool} aria-hidden />, []);
  if (!hasPanels) return pool;
  return pool;
}
