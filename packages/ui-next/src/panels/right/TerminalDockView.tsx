import React from 'react';
import type { AppViewModel, TerminalDockDropVM, TerminalDockRegionVM, UIIntent } from '@specwave/contracts';
import { ClosableTab } from '../../primitives/ClosableTab';
import type { SubscribeTerminalEvent } from '../../shell/ports';
import { TerminalRuntime } from './TerminalRuntime';
import styles from './TerminalDockView.module.css';

type TerminalDockIntent = Extract<
  UIIntent,
  | { type: 'TERMINAL_PANEL_SET_ACTIVE' }
  | { type: 'TERMINAL_PANEL_CLOSE' }
  | { type: 'TERMINAL_DOCK_DROP' }
  | { type: 'TERMINAL_DOCK_SPLITTER_SET' }
  | { type: 'TERMINAL_WRITE' }
  | { type: 'TERMINAL_RESIZE' }
  | { type: 'TERMINAL_COPY' }
  | { type: 'TERMINAL_PASTE' }
>;

export type TerminalDockViewProps = {
  terminal: AppViewModel['terminal'];
  dispatch: (intent: TerminalDockIntent) => void;
  subscribeTerminalEvent?: SubscribeTerminalEvent;
  visible: boolean;
};

type DropPreview =
  | { regionId: TerminalDockRegionVM['id']; kind: 'merge' }
  | { regionId: TerminalDockRegionVM['id']; kind: 'split'; side: NonNullable<Extract<TerminalDockDropVM, { kind: 'split' }>['side']> }
  | { regionId: TerminalDockRegionVM['id']; kind: 'swap'; targetTabId: string };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const clamp01 = (v: number) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);
const clampSplit = (v: number) => clamp(clamp01(v), 0.15, 0.85);
const ratioStr = (ratio: number) => `${Math.round(clampSplit(ratio) * 10_000) / 10_000}`;

export function TerminalDockView(props: TerminalDockViewProps) {
  const terminal = props.terminal;
  const dock = terminal.dock;
  const hasPanels = terminal.panelIds.length > 0;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const splitRowRef = React.useRef<HTMLDivElement | null>(null);

  const mountByIdRef = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [mountVersion, setMountVersion] = React.useState(0);
  const containerRefFnById = React.useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const [dropPreview, setDropPreview] = React.useState<DropPreview | null>(null);

  const visibleIds = React.useMemo(() => dock.regions.map((r) => r.activeTabId).filter(Boolean) as string[], [dock.regions]);

  const getMountRef = React.useCallback((id: string) => {
    const hit = containerRefFnById.current.get(id);
    if (hit) return hit;
    const fn = (el: HTMLDivElement | null) => {
      const prev = mountByIdRef.current.get(id) ?? null;
      if (prev === el) return;
      mountByIdRef.current.set(id, el);
      setMountVersion((v) => (v + 1) % 1_000_000);
    };
    containerRefFnById.current.set(id, fn);
    return fn;
  }, []);

  const getPsTitle = React.useCallback(
    (id: string) => {
      const idx = terminal.panelIds.indexOf(id);
      return idx >= 0 ? `PS${idx + 1}` : id;
    },
    [terminal.panelIds]
  );

  const canSplitHere = React.useCallback(
    (regionsCount: number, side: 'left' | 'right' | 'top' | 'bottom') => {
      if (terminal.panelIds.length < 2) return false;
      if (regionsCount >= 4) return false;
      if (regionsCount === 2) return side === 'top' || side === 'bottom';
      return true;
    },
    [terminal.panelIds.length]
  );

  const computeContentDrop = React.useCallback(
    (args: { e: React.DragEvent; regionId: TerminalDockRegionVM['id'] }): TerminalDockDropVM => {
      const rect = (args.e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = args.e.clientX - rect.left;
      const y = args.e.clientY - rect.top;
      const ux = rect.width > 0 ? x / rect.width : 0.5;
      const uy = rect.height > 0 ? y / rect.height : 0.5;

      const regionsCount = dock.regions.length;
      if (terminal.panelIds.length < 2) return { kind: 'merge', targetRegionId: args.regionId };
      if (regionsCount >= 4) return { kind: 'merge', targetRegionId: args.regionId };

      if (regionsCount === 1) {
        const dx = Math.abs(ux - 0.5);
        const dy = Math.abs(uy - 0.5);
        const side = dy >= dx ? (uy < 0.5 ? 'top' : 'bottom') : ux < 0.5 ? 'left' : 'right';
        if (canSplitHere(1, side)) return { kind: 'split', targetRegionId: args.regionId, side };
        return { kind: 'merge', targetRegionId: args.regionId };
      }

      if (regionsCount === 2) {
        const side = uy < 0.5 ? 'top' : 'bottom';
        if (canSplitHere(2, side)) return { kind: 'split', targetRegionId: args.regionId, side };
        return { kind: 'merge', targetRegionId: args.regionId };
      }

      if (regionsCount === 3 && dock.layout.kind === 'three') {
        const primaryRegionId = dock.layout.primary === 'top' ? dock.regions[0]?.id : dock.regions[2]?.id;
        if (primaryRegionId && primaryRegionId === args.regionId) {
          const side = ux < 0.5 ? 'left' : 'right';
          if (canSplitHere(3, side)) return { kind: 'split', targetRegionId: args.regionId, side };
          return { kind: 'merge', targetRegionId: args.regionId };
        }
      }

      const edge = Math.min(64, Math.max(36, Math.min(rect.width, rect.height) * 0.18));
      const side =
        x <= edge ? 'left' : x >= rect.width - edge ? 'right' : y <= edge ? 'top' : y >= rect.height - edge ? 'bottom' : null;

      if (side && canSplitHere(regionsCount, side)) return { kind: 'split', targetRegionId: args.regionId, side };
      return { kind: 'merge', targetRegionId: args.regionId };
    },
    [canSplitHere, dock.layout.kind, dock.regions, terminal.panelIds.length]
  );

  const onDropWith = React.useCallback(
    (draggedId: string, drop: TerminalDockDropVM) => {
      if (!draggedId) return;
      props.dispatch({ type: 'TERMINAL_DOCK_DROP', id: draggedId, drop });
    },
    [props]
  );

  const startSplitDrag = React.useCallback(
    (args: {
      e: React.PointerEvent;
      key: Extract<UIIntent, { type: 'TERMINAL_DOCK_SPLITTER_SET' }>['key'];
      axis: 'x' | 'y';
      el: HTMLDivElement | null;
      invert?: boolean;
    }) => {
      if (!args.el) return;
      if (args.e.button !== 0) return;
      args.e.preventDefault();

      const rect = args.el.getBoundingClientRect();
      const isX = args.axis === 'x';
      const invert = Boolean(args.invert);

      const onMove = (ev: PointerEvent) => {
        const pos = isX ? ev.clientX - rect.left : ev.clientY - rect.top;
        const size = isX ? rect.width : rect.height;
        if (size <= 0) return;
        let ratio = pos / size;
        if (invert) ratio = 1 - ratio;
        props.dispatch({ type: 'TERMINAL_DOCK_SPLITTER_SET', key: args.key, ratio: clampSplit(ratio) });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    },
    [props]
  );

  const emptyHint = React.useMemo(
    () => (
      <div className={styles.root} aria-label="终端空态">
        <div className={styles.pad} aria-label="终端提示">
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--sw-terminal-fg)' }}>
            <div style={{ textAlign: 'center', fontWeight: 800 }}>
              <div style={{ marginBottom: 6 }}>还没有终端面板</div>
              <div style={{ fontWeight: 700, opacity: 0.72 }}>点击右上角 “+” 新建一个终端</div>
            </div>
          </div>
        </div>
      </div>
    ),
    []
  );

  if (!hasPanels) return emptyHint;

  const layout = dock.layout;
  const vars: React.CSSProperties & Record<string, string> = {};
  if (layout.kind === 'two') {
    if (layout.dir === 'cols') vars['--sw-split-x'] = ratioStr(layout.ratio);
    if (layout.dir === 'rows') vars['--sw-split-y'] = ratioStr(layout.ratio);
  }
  if (layout.kind === 'three') {
    vars['--sw-split-y'] = ratioStr(layout.ratio);
    vars['--sw-split-x'] = ratioStr(layout.secondaryRatio);
  }
  if (layout.kind === 'four') {
    vars['--sw-split-x'] = ratioStr(layout.splitX);
    vars['--sw-split-y'] = ratioStr(layout.splitY);
  }

  const renderRegion = (region: TerminalDockRegionVM, mountId: string | null, regionStyle?: React.CSSProperties) => {
    const tabs = region.tabIds;
    const active = region.activeTabId;
    return (
      <div className={styles.region} style={regionStyle} aria-label={`终端区域 ${region.id}`}>
        <div
          className={styles.regionHeader}
          role="tablist"
          aria-label={`终端区域 ${region.id} 页签`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropPreview({ regionId: region.id, kind: 'merge' });
          }}
          onDragLeave={() => setDropPreview(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (!draggedId) return;
            onDropWith(draggedId, { kind: 'merge', targetRegionId: region.id });
            setDropPreview(null);
          }}
        >
          <div className={styles.regionTabs} aria-label="终端区域页签列表">
            {tabs.map((id) => (
              <ClosableTab
                key={id}
                selected={id === active}
                title={getPsTitle(id)}
                variant="terminal"
                onSelect={() => props.dispatch({ type: 'TERMINAL_PANEL_SET_ACTIVE', id })}
                onClose={() => props.dispatch({ type: 'TERMINAL_PANEL_CLOSE', id })}
                rootProps={{
                  draggable: true,
                  onDragStart: (e) => {
                    e.dataTransfer.setData('text/plain', id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDropPreview(null);
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (!draggedId || draggedId === id) return;
                    onDropWith(draggedId, { kind: 'swap', targetTabId: id });
                    setDropPreview(null);
                  },
                  onDragOver: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDropPreview({ regionId: region.id, kind: 'swap', targetTabId: id });
                  }
                }}
              />
            ))}
          </div>
          <div className={styles.regionHeaderHint} aria-hidden>
            拖拽页签分区
          </div>
        </div>

        <div
          className={styles.regionBody}
          aria-label="终端区域内容"
          onDragOver={(e) => {
            e.preventDefault();
            const drop = computeContentDrop({ e, regionId: region.id });
            if (drop.kind === 'merge') setDropPreview({ regionId: region.id, kind: 'merge' });
            if (drop.kind === 'split') setDropPreview({ regionId: region.id, kind: 'split', side: drop.side });
          }}
          onDragLeave={() => setDropPreview(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (!draggedId) return;
            const drop = computeContentDrop({ e, regionId: region.id });
            onDropWith(draggedId, drop);
            setDropPreview(null);
          }}
        >
          <div className={styles.mount} ref={mountId ? getMountRef(mountId) : undefined} aria-label="终端挂载点" />
          <div
            className={styles.splitOverlay}
            data-active={dropPreview?.regionId === region.id && dropPreview.kind === 'split' ? '1' : '0'}
            data-dir={
              dropPreview?.regionId === region.id && dropPreview.kind === 'split' && (dropPreview.side === 'left' || dropPreview.side === 'right')
                ? 'cols'
                : 'rows'
            }
            aria-hidden
          >
            <div
              className={styles.splitBox}
              data-hot={
                dropPreview?.regionId === region.id &&
                dropPreview.kind === 'split' &&
                (dropPreview.side === 'left' || dropPreview.side === 'top')
                  ? '1'
                  : '0'
              }
            />
            <div
              className={styles.splitBox}
              data-hot={
                dropPreview?.regionId === region.id &&
                dropPreview.kind === 'split' &&
                (dropPreview.side === 'right' || dropPreview.side === 'bottom')
                  ? '1'
                  : '0'
              }
            />
          </div>
          <div
            className={styles.dropOverlay}
            data-active={
              dropPreview?.regionId === region.id &&
              (dropPreview.kind === 'merge' || dropPreview.kind === 'swap')
                ? '1'
                : '0'
            }
            aria-hidden
          />
        </div>
      </div>
    );
  };

  const r = dock.regions;
  const safeRegion = (i: number): TerminalDockRegionVM => {
    const hit = r[i];
    if (hit) return hit;
    const id = (['A', 'B', 'C', 'D'][i] ?? 'A') as TerminalDockRegionVM['id'];
    return { id, tabIds: [], activeTabId: null };
  };
  const focusedId = terminal.activePanelId || visibleIds[0] || null;

  const frame = (
    <div ref={rootRef} className={styles.frame} aria-label="终端分区框架">
      <TerminalRuntime
        panelIds={terminal.panelIds}
        visibleIds={visibleIds}
        focusedId={focusedId}
        mountById={mountByIdRef.current}
        mountVersion={mountVersion}
        dispatch={props.dispatch}
        subscribeTerminalEvent={props.subscribeTerminalEvent}
        visible={props.visible}
      />

      {layout.kind === 'one' && (
        <div className={styles.layout} aria-label="单区布局">
          {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null)}
        </div>
      )}

      {layout.kind === 'two' && layout.dir === 'cols' && (
        <div className={`${styles.layout} ${styles.twoCols}`} style={{ ...vars }} aria-label="双区左右布局">
          {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null)}
          <div
            className={styles.divider}
            data-axis="x"
            aria-label="终端分隔条"
            role="separator"
            onPointerDown={(e) => startSplitDrag({ e, key: 'two', axis: 'x', el: rootRef.current })}
          />
          {renderRegion(safeRegion(1), safeRegion(1).activeTabId ?? null)}
        </div>
      )}

      {layout.kind === 'two' && layout.dir === 'rows' && (
        <div className={`${styles.layout} ${styles.twoRows}`} style={{ ...vars }} aria-label="双区上下布局">
          {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null)}
          <div
            className={styles.divider}
            data-axis="y"
            aria-label="终端分隔条"
            role="separator"
            onPointerDown={(e) => startSplitDrag({ e, key: 'two', axis: 'y', el: rootRef.current })}
          />
          {renderRegion(safeRegion(1), safeRegion(1).activeTabId ?? null)}
        </div>
      )}

      {layout.kind === 'three' && layout.primary === 'top' && (
        <div className={`${styles.layout} ${styles.threeTop}`} style={{ ...vars }} aria-label="三区上 1 下 2 布局">
          {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null)}
          <div
            className={styles.divider}
            data-axis="y"
            aria-label="终端分隔条"
            role="separator"
            onPointerDown={(e) => startSplitDrag({ e, key: 'threePrimary', axis: 'y', el: rootRef.current })}
          />
          <div ref={splitRowRef} className={styles.threeSplitRow} aria-label="底部双区">
            {renderRegion(safeRegion(1), safeRegion(1).activeTabId ?? null)}
            <div
              className={styles.divider}
              data-axis="x"
              aria-label="终端分隔条"
              role="separator"
              onPointerDown={(e) => startSplitDrag({ e, key: 'threeSecondary', axis: 'x', el: splitRowRef.current })}
            />
            {renderRegion(safeRegion(2), safeRegion(2).activeTabId ?? null)}
          </div>
        </div>
      )}

      {layout.kind === 'three' && layout.primary === 'bottom' && (
        <div className={`${styles.layout} ${styles.threeBottom}`} style={{ ...vars }} aria-label="三区上 2 下 1 布局">
          <div ref={splitRowRef} className={styles.threeSplitRow} aria-label="顶部双区">
            {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null)}
            <div
              className={styles.divider}
              data-axis="x"
              aria-label="终端分隔条"
              role="separator"
              onPointerDown={(e) => startSplitDrag({ e, key: 'threeSecondary', axis: 'x', el: splitRowRef.current })}
            />
            {renderRegion(safeRegion(1), safeRegion(1).activeTabId ?? null)}
          </div>
          <div
            className={styles.divider}
            data-axis="y"
            aria-label="终端分隔条"
            role="separator"
            onPointerDown={(e) => startSplitDrag({ e, key: 'threePrimary', axis: 'y', el: rootRef.current, invert: true })}
          />
          {renderRegion(safeRegion(2), safeRegion(2).activeTabId ?? null)}
        </div>
      )}

      {layout.kind === 'four' && (
        <div className={`${styles.layout} ${styles.fourGrid}`} style={{ ...vars }} aria-label="四区布局">
          {renderRegion(safeRegion(0), safeRegion(0).activeTabId ?? null, { gridColumn: '1', gridRow: '1' })}
          <div
            className={styles.divider}
            data-axis="x"
            aria-label="终端分隔条"
            role="separator"
            style={{ gridColumn: '2', gridRow: '1 / 4' }}
            onPointerDown={(e) => startSplitDrag({ e, key: 'fourX', axis: 'x', el: rootRef.current })}
          />
          {renderRegion(safeRegion(1), safeRegion(1).activeTabId ?? null, { gridColumn: '3', gridRow: '1' })}
          <div
            className={styles.divider}
            data-axis="y"
            aria-label="终端分隔条"
            role="separator"
            style={{ gridColumn: '1 / 4', gridRow: '2' }}
            onPointerDown={(e) => startSplitDrag({ e, key: 'fourY', axis: 'y', el: rootRef.current })}
          />
          {renderRegion(safeRegion(2), safeRegion(2).activeTabId ?? null, { gridColumn: '1', gridRow: '3' })}
          {renderRegion(safeRegion(3), safeRegion(3).activeTabId ?? null, { gridColumn: '3', gridRow: '3' })}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.root} aria-label="终端分区面板">
      <div className={styles.pad} aria-label="终端内边距">
        {frame}
      </div>
    </div>
  );
}
