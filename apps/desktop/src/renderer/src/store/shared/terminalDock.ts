import type { TerminalDockDropVM, TerminalDockSplitterKeyVM, TerminalDockVM } from '@specwave/contracts';

const REGION_IDS = ['A', 'B', 'C', 'D'] as const;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return clamp(v, 0, 1);
}

function clampSplit(v: number): number {
  return clamp(clamp01(v), 0.15, 0.85);
}

function uniqueKeepOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function findRegionIndexByTab(dock: TerminalDockVM, id: string): number {
  return dock.regions.findIndex((r) => r.tabIds.includes(id));
}

function ensureLayoutForCount(prev: TerminalDockVM['layout'], count: number): TerminalDockVM['layout'] {
  if (count <= 1) return { kind: 'one' };
  if (count === 2) return prev.kind === 'two' ? { ...prev, ratio: clampSplit(prev.ratio) } : { kind: 'two', dir: 'cols', ratio: 0.5 };
  if (count === 3)
    return prev.kind === 'three'
      ? { ...prev, ratio: clampSplit(prev.ratio), secondaryRatio: clampSplit(prev.secondaryRatio) }
      : { kind: 'three', primary: 'top', ratio: 0.5, secondaryRatio: 0.5 };
  return prev.kind === 'four'
    ? { ...prev, splitX: clampSplit(prev.splitX), splitY: clampSplit(prev.splitY) }
    : { kind: 'four', splitX: 0.5, splitY: 0.5 };
}

export function normalizeTerminalDock(args: {
  panelIds: string[];
  activePanelId: string;
  dock: TerminalDockVM | null | undefined;
}): TerminalDockVM {
  const { panelIds, activePanelId } = args;
  const allowed = new Set(panelIds);
  const maxRegions = Math.min(4, panelIds.length);

  if (panelIds.length === 0) {
    return { layout: { kind: 'one' }, regions: [] };
  }

  const base: TerminalDockVM =
    args.dock && args.dock.regions.length
      ? {
          layout: args.dock.layout,
          regions: args.dock.regions.map((r) => ({
            id: r.id,
            tabIds: Array.isArray(r.tabIds) ? r.tabIds.slice() : [],
            activeTabId: r.activeTabId ?? null
          }))
        }
      : {
          layout: { kind: 'one' },
          regions: [{ id: 'A', tabIds: panelIds.slice(), activeTabId: null }]
        };

  const seen = new Set<string>();
  const nextRegions = base.regions
    .map((r) => {
      const tabIds = uniqueKeepOrder(r.tabIds.filter((id) => allowed.has(id)));
      const deduped = tabIds.filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      const activeTabId = deduped.includes(r.activeTabId ?? '') ? (r.activeTabId as string) : (deduped[0] ?? null);
      return { ...r, tabIds: deduped, activeTabId };
    })
    .filter((r) => r.tabIds.length > 0);

  if (!nextRegions.length) {
    const active = allowed.has(activePanelId) ? activePanelId : (panelIds[0] ?? activePanelId ?? '');
    return {
      layout: { kind: 'one' },
      regions: [{ id: 'A', tabIds: panelIds.slice(), activeTabId: active }]
    };
  }

  const missing = panelIds.filter((id) => !seen.has(id));
  if (missing.length) {
    const first = nextRegions[0]!;
    nextRegions[0] = { ...first, tabIds: [...first.tabIds, ...missing] };
  }

  for (const r of nextRegions) {
    if (r.activeTabId && r.tabIds.includes(r.activeTabId)) continue;
    r.activeTabId = r.tabIds[0] ?? null;
  }

  while (nextRegions.length > maxRegions) {
    const tail = nextRegions.pop();
    if (!tail) break;
    const first = nextRegions[0]!;
    nextRegions[0] = { ...first, tabIds: [...first.tabIds, ...tail.tabIds] };
    if (!nextRegions[0]!.activeTabId) nextRegions[0]!.activeTabId = tail.activeTabId ?? nextRegions[0]!.tabIds[0] ?? null;
  }

  const normalizedRegions = nextRegions.map((r, idx) => ({
    id: REGION_IDS[idx] ?? 'A',
    tabIds: r.tabIds,
    activeTabId: r.activeTabId ?? r.tabIds[0] ?? null
  }));

  const layout = ensureLayoutForCount(base.layout, normalizedRegions.length);
  return { layout, regions: normalizedRegions };
}

export function setDockActiveTab(args: { panelIds: string[]; activePanelId: string; dock: TerminalDockVM; id: string }): TerminalDockVM {
  const normalized = normalizeTerminalDock({ panelIds: args.panelIds, activePanelId: args.activePanelId, dock: args.dock });
  const idx = findRegionIndexByTab(normalized, args.id);
  if (idx < 0) return normalized;
  const nextRegions = normalized.regions.map((r, i) => (i === idx ? { ...r, activeTabId: args.id } : r));
  return { ...normalized, regions: nextRegions };
}

export function applyDockSplitter(args: { dock: TerminalDockVM; key: TerminalDockSplitterKeyVM; ratio: number }): TerminalDockVM {
  const ratio = clampSplit(args.ratio);
  const dock = args.dock;
  const layout = dock.layout;
  if (args.key === 'two' && layout.kind === 'two') return { ...dock, layout: { ...layout, ratio } };
  if (args.key === 'threePrimary' && layout.kind === 'three') return { ...dock, layout: { ...layout, ratio } };
  if (args.key === 'threeSecondary' && layout.kind === 'three') return { ...dock, layout: { ...layout, secondaryRatio: ratio } };
  if (args.key === 'fourX' && layout.kind === 'four') return { ...dock, layout: { ...layout, splitX: ratio } };
  if (args.key === 'fourY' && layout.kind === 'four') return { ...dock, layout: { ...layout, splitY: ratio } };
  return dock;
}

function removeTabFromRegions(regions: TerminalDockVM['regions'], id: string): TerminalDockVM['regions'] {
  return regions
    .map((r) => {
      const tabIds = r.tabIds.filter((x) => x !== id);
      const activeTabId = tabIds.includes(r.activeTabId ?? '') ? r.activeTabId : (tabIds[0] ?? null);
      return { ...r, tabIds, activeTabId };
    })
    .filter((r) => r.tabIds.length > 0);
}

function moveTab(args: { dock: TerminalDockVM; id: string; targetRegionId: string }): TerminalDockVM {
  const srcIdx = findRegionIndexByTab(args.dock, args.id);
  const dstIdx = args.dock.regions.findIndex((r) => r.id === args.targetRegionId);
  if (srcIdx < 0 || dstIdx < 0) return args.dock;
  if (srcIdx === dstIdx) return args.dock;

  const afterRemove = removeTabFromRegions(args.dock.regions, args.id);
  const nextRegions = afterRemove.map((r) => ({ ...r }));
  const nextDstIdx = nextRegions.findIndex((r) => r.id === args.targetRegionId);
  if (nextDstIdx < 0) return args.dock;
  const dst = nextRegions[nextDstIdx]!;
  const nextTabIds = dst.tabIds.includes(args.id) ? dst.tabIds : [...dst.tabIds, args.id];
  nextRegions[nextDstIdx] = { ...dst, tabIds: nextTabIds, activeTabId: args.id };
  return { ...args.dock, regions: nextRegions };
}

function swapTabs(args: { dock: TerminalDockVM; a: string; b: string }): TerminalDockVM {
  const aIdx = findRegionIndexByTab(args.dock, args.a);
  const bIdx = findRegionIndexByTab(args.dock, args.b);
  if (aIdx < 0 || bIdx < 0) return args.dock;
  if (aIdx === bIdx) return args.dock;

  const nextRegions = args.dock.regions.map((r) => ({ ...r, tabIds: r.tabIds.slice() }));
  const ra = nextRegions[aIdx]!;
  const rb = nextRegions[bIdx]!;
  const ai = ra.tabIds.indexOf(args.a);
  const bi = rb.tabIds.indexOf(args.b);
  if (ai < 0 || bi < 0) return args.dock;
  ra.tabIds[ai] = args.b;
  rb.tabIds[bi] = args.a;
  ra.activeTabId = args.b;
  rb.activeTabId = args.a;
  return { ...args.dock, regions: nextRegions };
}

export function applyDockDrop(args: {
  panelIds: string[];
  activePanelId: string;
  dock: TerminalDockVM;
  id: string;
  drop: TerminalDockDropVM;
}): TerminalDockVM {
  const normalized = normalizeTerminalDock({ panelIds: args.panelIds, activePanelId: args.activePanelId, dock: args.dock });
  if (!args.panelIds.includes(args.id)) return normalized;

  if (args.drop.kind === 'swap') {
    if (!args.drop.targetTabId || args.drop.targetTabId === args.id) return normalized;
    return swapTabs({ dock: normalized, a: args.id, b: args.drop.targetTabId });
  }

  if (args.drop.kind === 'merge') {
    const moved = moveTab({ dock: normalized, id: args.id, targetRegionId: args.drop.targetRegionId });
    const rekeyed = normalizeTerminalDock({ panelIds: args.panelIds, activePanelId: args.id, dock: moved });
    return rekeyed;
  }

  if (args.drop.kind === 'split') {
    if (args.panelIds.length < 2) return normalized;
    if (normalized.regions.length >= 4) return normalized;

    const side = args.drop.side;
    const targetRegionId = args.drop.targetRegionId;
    const afterRemove = removeTabFromRegions(normalized.regions, args.id);

    const newRegion = { id: 'D' as const, tabIds: [args.id], activeTabId: args.id };
    const candidate = [...afterRemove.map((r) => ({ ...r })), newRegion];

    const count = candidate.length;
    if (count > 4) return normalized;

    const prevLayout = normalized.layout;
    let layout = ensureLayoutForCount(prevLayout, count);
    let regions = candidate;

    if (count === 2) {
      const dir = side === 'left' || side === 'right' ? 'cols' : 'rows';
      layout = { kind: 'two', dir, ratio: prevLayout.kind === 'two' ? prevLayout.ratio : 0.5 };
      const a = candidate[0]!;
      if (side === 'left' || side === 'top') regions = [newRegion, a];
      if (side === 'right' || side === 'bottom') regions = [a, newRegion];
    } else if (count === 3) {
      const primary = side === 'bottom' ? 'bottom' : 'top';
      layout =
        prevLayout.kind === 'three'
          ? { ...prevLayout, primary }
          : { kind: 'three', primary, ratio: 0.5, secondaryRatio: 0.5 };
      const target = afterRemove.find((r) => r.id === targetRegionId) ?? afterRemove[0]!;
      const other = afterRemove.find((r) => r !== target) ?? afterRemove[1]!;
      if (primary === 'top') regions = [newRegion, target, other];
      if (primary === 'bottom') regions = [target, other, newRegion];
    } else if (count === 4) {
      const a = afterRemove[0]!;
      const b = afterRemove[1]!;
      const c = afterRemove[2]!;
      if (prevLayout.kind === 'three' && prevLayout.primary === 'top') regions = [a, newRegion, b, c];
      else if (prevLayout.kind === 'three' && prevLayout.primary === 'bottom') regions = [a, b, c, newRegion];
      else regions = [a, b, c, newRegion];
      layout = prevLayout.kind === 'four' ? prevLayout : { kind: 'four', splitX: 0.5, splitY: 0.5 };
    }

    const rekeyed = normalizeTerminalDock({ panelIds: args.panelIds, activePanelId: args.id, dock: { layout, regions } });
    return rekeyed;
  }

  return normalized;
}
