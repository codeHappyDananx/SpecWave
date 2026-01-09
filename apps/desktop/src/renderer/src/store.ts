import { create } from 'zustand';
import type {
  AppViewModel,
  ChatMessageVM,
  ContentKind,
  ContentMode,
  ExplorerNodeVM,
  LinkedDocVM,
  TaskBoardVM,
  TaskItemVM,
  UIIntent
} from '@specwave/contracts';

type AppState = {
  vm: AppViewModel;
  intentLog: string[];
  drag: DragSnapshot | null;
  dispatch: (intent: UIIntent) => void;
};

const msg = (who: ChatMessageVM['who'], text: string): ChatMessageVM => ({ who, text });

const initialTerminalBootText = ['正在启动终端…\r\n'];
const terminalUserTyped = new Set<string>();

type SpecwaveWindowKind = 'welcome' | 'main';

function getSpecwaveWindowKind(): SpecwaveWindowKind {
  if (typeof window === 'undefined') return 'main';
  const v = new URLSearchParams(window.location.search).get('specwaveWindow');
  if (v === 'main') return 'main';
  return 'welcome';
}

function getBootProjectPath(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('projectPath');
}

function loadSkin(): AppViewModel['ui']['skin'] {
  if (typeof window === 'undefined') return 'blue';
  try {
    const v = window.localStorage.getItem('specwave_skin');
    if (v === 'blue' || v === 'purple' || v === 'green' || v === 'amber') return v;
  } catch {}
  return 'blue';
}

function loadTheme(): AppViewModel['ui']['theme'] {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem('specwave_theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'light';
}

function loadExplorerShowIgnored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('specwave_explorer_show_ignored') === '1';
  } catch {}
  return false;
}

// 关键处理节点：Renderer 意外刷新/热重载时，内存态的页签会丢失，表现为“过一会儿新增项目被关掉”。
// 这里用 sessionStorage 记住当前窗口的 openTabs/activeTabId，避免刷新把用户刚开的项目吞掉。
const PROJECTS_SESSION_KEY = 'specwave_projects_session_v1';
const UI_SESSION_KEY = 'specwave_ui_session_v1';

function loadProjectsSession(): AppViewModel['projects'] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PROJECTS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed == null) return null;

    const obj = parsed as { openTabs?: unknown; activeTabId?: unknown };
    if (!Array.isArray(obj.openTabs)) return null;

    const openTabs: AppViewModel['projects']['openTabs'] = [];
    for (const item of obj.openTabs) {
      if (typeof item !== 'object' || item == null) return null;
      const tab = item as { id?: unknown; folderName?: unknown; path?: unknown };
      if (typeof tab.id !== 'string' || typeof tab.folderName !== 'string') return null;
      const path = tab.path;
      if (path !== null && typeof path !== 'string') return null;
      openTabs.push({ id: tab.id, folderName: tab.folderName, path });
    }

    let activeTabId: string | null = typeof obj.activeTabId === 'string' ? obj.activeTabId : null;
    if (activeTabId && !openTabs.some((t) => t.id === activeTabId)) activeTabId = openTabs[0]?.id ?? null;
    return { openTabs, activeTabId };
  } catch {
    return null;
  }
}

function persistProjectsSession(projects: AppViewModel['projects']) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PROJECTS_SESSION_KEY, JSON.stringify(projects));
  } catch {}
}

type UiSessionSnapshot = {
  leftVisible?: boolean;
  centerVisible?: boolean;
  rightVisible?: boolean;
  rightMode?: AppViewModel['rightMode'];
  explorerExpanded?: { workspace?: string[]; project?: string[] };
  explorerSelectedPath?: string | null;
  lastOpenFilePath?: string | null;
  projectRoot?: string | null;
  workspaceRoot?: string | null;
};

function loadUiSession(): UiSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.sessionStorage.getItem(UI_SESSION_KEY) ??
      // 关键处理节点：开发模式下可能触发“整窗重启”（main/preload 重启），sessionStorage 会丢；localStorage 用来兜底恢复。
      window.localStorage.getItem(UI_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed == null) return null;
    const obj = parsed as UiSessionSnapshot;

    const snap: UiSessionSnapshot = {};
    if (typeof obj.leftVisible === 'boolean') snap.leftVisible = obj.leftVisible;
    if (typeof obj.centerVisible === 'boolean') snap.centerVisible = obj.centerVisible;
    if (typeof obj.rightVisible === 'boolean') snap.rightVisible = obj.rightVisible;
    if (obj.rightMode === 'terminal' || obj.rightMode === 'chat') snap.rightMode = obj.rightMode;
    if (typeof obj.explorerSelectedPath === 'string' || obj.explorerSelectedPath === null) snap.explorerSelectedPath = obj.explorerSelectedPath;
    if (typeof obj.lastOpenFilePath === 'string' || obj.lastOpenFilePath === null) snap.lastOpenFilePath = obj.lastOpenFilePath;
    if (typeof obj.projectRoot === 'string' || obj.projectRoot === null) snap.projectRoot = obj.projectRoot;
    if (typeof obj.workspaceRoot === 'string' || obj.workspaceRoot === null) snap.workspaceRoot = obj.workspaceRoot;

    const expanded = obj.explorerExpanded;
    if (expanded && typeof expanded === 'object') {
      const workspace = (expanded as { workspace?: unknown }).workspace;
      const project = (expanded as { project?: unknown }).project;
      const nextExpanded: { workspace?: string[]; project?: string[] } = {};
      if (Array.isArray(workspace) && workspace.every((x) => typeof x === 'string')) nextExpanded.workspace = workspace;
      if (Array.isArray(project) && project.every((x) => typeof x === 'string')) nextExpanded.project = project;
      if (nextExpanded.workspace || nextExpanded.project) snap.explorerExpanded = nextExpanded;
    }

    return snap;
  } catch {
    return null;
  }
}

function persistUiSession(snap: UiSessionSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(UI_SESSION_KEY, JSON.stringify(snap));
    window.localStorage.setItem(UI_SESSION_KEY, JSON.stringify(snap));
  } catch {}
}

const specwaveWindowKind = getSpecwaveWindowKind();
const bootProjectPath = getBootProjectPath();
const restoredProjectsSession = specwaveWindowKind === 'main' ? loadProjectsSession() : null;
const restoredUiSession = specwaveWindowKind === 'main' ? loadUiSession() : null;

async function restartIdleTerminalSessionsToCwd(args: {
  api: Window['specwave'] | undefined;
  cwd: string;
  terminalIds: string[];
  setState: (fn: (state: AppState) => Partial<AppState> | AppState) => void;
}) {
  const api = args.api;
  if (!api?.terminalCreateSession) return;

  args.setState((state) => {
    const vm2 = state.vm;
    const nextOutput = { ...vm2.terminal.outputByPanel };
    for (const id of args.terminalIds) {
      if (terminalUserTyped.has(id)) continue;
      nextOutput[id] = ['正在启动终端…\r\n'];
    }
    return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: nextOutput } } };
  });

  for (const id of args.terminalIds) {
    if (terminalUserTyped.has(id)) continue;
    const res = await api.terminalCreateSession({ id, cwd: args.cwd });
    if (res.ok) continue;
    args.setState((state) => {
      const vm2 = state.vm;
      const prev = vm2.terminal.outputByPanel[id] ?? [];
      const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
      return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: { ...vm2.terminal.outputByPanel, [id]: next } } } };
    });
  }
}

const initialVm: AppViewModel = {
  app: { mode: specwaveWindowKind === 'welcome' ? 'welcome' : 'main', recentProjects: [] },
  projects: restoredProjectsSession ?? { openTabs: [], activeTabId: null },
  explorer: {
    workspaceRoot: null,
    projectRoot: null,
    workspace: [],
    project: [],
    expanded: {
      workspace: restoredUiSession?.explorerExpanded?.workspace ?? [],
      project: restoredUiSession?.explorerExpanded?.project ?? []
    },
    selectedPath: restoredUiSession?.explorerSelectedPath ?? null,
    showIgnored: loadExplorerShowIgnored(),
    isLoading: false,
    error: null
  },
  content: {
    file: null,
    text: '',
    draftText: '',
    mode: 'view',
    isDirty: false,
    saveStatus: 'idle',
    saveError: null,
    taskBoard: null,
    find: { isOpen: false, query: '', matchStarts: [], activeIndex: 0 }
  },
  leftVisible: restoredUiSession?.leftVisible ?? true,
  centerVisible: restoredUiSession?.centerVisible ?? true,
  rightVisible: restoredUiSession?.rightVisible ?? true,
  rightMode: restoredUiSession?.rightMode ?? 'terminal',
  globalSearchQuery: '',
  terminal: {
    activePanelId: 'terminal-1',
    panelIds: ['terminal-1'],
    outputByPanel: { 'terminal-1': initialTerminalBootText }
  },
  chat: {
    sessionIds: ['chat-1', 'chat-2'],
    activeSessionId: 'chat-1',
    messagesBySession: {
      'chat-1': [
        msg('你', '我右区想随时切终端 / 对话，不想上下挤。'),
        msg('AI', '收到：右区改为模式切换；终端/对话都支持多面板，互不共存。')
      ],
      'chat-2': [msg('AI', '这是第二个会话（示意），用于保留不同讨论上下文。')]
    },
    draftBySession: {
      'chat-1': '',
      'chat-2': ''
    }
  },
  ui: { theme: loadTheme(), skin: loadSkin() },
  panelMinW: {
    leftPx: 240,
    centerPx: Math.max(320, Math.round(1280 * 0.7)),
    rightPx: 320
  },
  layout: { containerWidthPx: 1280, isDragging: false, leftPx: 280, centerPx: 640, rightPx: 360 }
};

const SPLITTER_PX = 8;
const MIN_LEFT_PX = 240;
// 左区最大宽度不使用固定值：拖拽时需要按窗口宽度动态放开，否则最大化后无法继续挤压其它区域。
// 这里保留一个“展示默认”上限，主要用于非拖拽场景的 clamp（拖拽场景用动态上限）。
const MAX_LEFT_PX = 720;
const MIN_CENTER_PX = 320;
const MIN_RIGHT_PX = 320;
const MAX_TERMINAL_CHUNKS = 2000;

type DragSnapshot = {
  handle: 'L' | 'R';
  leftVisible: boolean;
  centerVisible: boolean;
  rightVisible: boolean;
  leftPx: number;
  centerPx: number;
  rightPx: number;
  containerWidthPx: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function splitterCountFlags(flags: { leftVisible: boolean; centerVisible: boolean; rightVisible: boolean }) {
  const n = Number(flags.leftVisible) + Number(flags.centerVisible) + Number(flags.rightVisible);
  if (n <= 1) return 0;
  return n - 1;
}

function normalizeLayoutStable(vm: AppViewModel) {
  let leftPx = vm.layout.leftPx;
  let centerPx = vm.layout.centerPx;
  let rightPx = vm.layout.rightPx;

  // 应用最小值约束
  if (vm.leftVisible) leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
  if (vm.centerVisible) centerPx = Math.max(MIN_CENTER_PX, centerPx);
  if (vm.rightVisible) rightPx = Math.max(MIN_RIGHT_PX, rightPx);

  // 计算可用空间，确保面板重新显示时能正确分配空间
  const splitters = splitterCountFlags(vm) * SPLITTER_PX;
  const available = Math.max(0, vm.layout.containerWidthPx - splitters);
  const visibleLeft = vm.leftVisible ? leftPx : 0;
  const visibleRight = vm.rightVisible ? rightPx : 0;
  const total = visibleLeft + centerPx + visibleRight;

  // 如果总宽度超出可用空间，从 centerPx 中扣除
  if (total > available && vm.centerVisible) {
    const overflow = total - available;
    centerPx = Math.max(MIN_CENTER_PX, centerPx - overflow);
  }

  return { leftPx, centerPx, rightPx };
}

function applyDrag(snapshot: DragSnapshot, deltaX: number) {
  const vmFlags = { leftVisible: snapshot.leftVisible, centerVisible: snapshot.centerVisible, rightVisible: snapshot.rightVisible };
  const total = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(vmFlags) * SPLITTER_PX);

  let leftVisible = snapshot.leftVisible;
  let centerVisible = snapshot.centerVisible;
  let rightVisible = snapshot.rightVisible;

  let leftPx = snapshot.leftPx;
  let centerPx = snapshot.centerPx;
  let rightPx = snapshot.rightPx;

  const hideLeft = () => {
    leftVisible = false;
    leftPx = 0;
  };
  const hideRight = () => {
    rightVisible = false;
    rightPx = 0;
  };

  if (snapshot.handle === 'L') {
    // 分界线右移：left 变宽；先压 center，再压 right，最后收起 right。
    // 分界线左移：left 变窄；先放 center（或 right），最小值触发收起 left。
    if (!leftVisible) {
      leftVisible = true;
      leftPx = MIN_LEFT_PX;
    }

    const desiredLeft = snapshot.leftPx + deltaX;
    if (desiredLeft < MIN_LEFT_PX) {
      hideLeft();
      const visibleFlags = { leftVisible, centerVisible, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
      if (centerVisible && rightVisible) {
        rightPx = Math.max(MIN_RIGHT_PX, snapshot.rightPx);
        centerPx = Math.max(MIN_CENTER_PX, totalAfter - rightPx);
        return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - rightPx, rightPx };
      }
      if (centerVisible) return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter, rightPx: 0 };
      if (rightVisible) return { leftVisible, centerVisible: false, rightVisible, leftPx, centerPx: 0, rightPx: totalAfter };
      return { leftVisible, centerVisible: false, rightVisible: false, leftPx: 0, centerPx: 0, rightPx: 0 };
    }

    // 拖拽时动态上限：允许把 left 拉得足够宽，才能继续压缩 center/right 直至隐藏。
    const splitters = splitterCountFlags({ leftVisible: true, centerVisible, rightVisible }) * SPLITTER_PX;
    const dynamicMax = Math.max(MIN_LEFT_PX, snapshot.containerWidthPx - splitters - (centerVisible ? MIN_CENTER_PX : 0));
    leftPx = clamp(desiredLeft, MIN_LEFT_PX, dynamicMax);
    const actualDelta = leftPx - snapshot.leftPx;

    if (centerVisible) {
      centerPx = snapshot.centerPx - actualDelta;
      rightPx = rightVisible ? snapshot.rightPx : 0;

      if (centerPx < MIN_CENTER_PX) {
        const deficit = MIN_CENTER_PX - centerPx;
        centerPx = MIN_CENTER_PX;
        if (rightVisible) rightPx = rightPx - deficit;
      }

      if (rightVisible && rightPx < MIN_RIGHT_PX) {
        hideRight();
      }

      const visibleFlags = { leftVisible, centerVisible, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);

      if (!rightVisible) {
        centerPx = Math.max(MIN_CENTER_PX, totalAfter - leftPx);
        // center 负责自适应；left 不能过大（已 clamp）
        return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - leftPx, rightPx: 0 };
      }

      return { leftVisible, centerVisible, rightVisible, leftPx, centerPx, rightPx };
    }

    if (rightVisible) {
      rightPx = snapshot.rightPx - actualDelta;
      if (rightPx < MIN_RIGHT_PX) {
        hideRight();
      }
      const visibleFlags = { leftVisible, centerVisible: false, rightVisible };
      const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
      if (!rightVisible) {
        // 只有 left：右侧允许空白，left 不能过大
        leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
        return { leftVisible, centerVisible: false, rightVisible: false, leftPx, centerPx: 0, rightPx: 0 };
      }
      return { leftVisible, centerVisible: false, rightVisible, leftPx, centerPx: 0, rightPx: totalAfter - leftPx };
    }

    // 只有 left：不处理 total 约束，右侧空白
    leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
    return { leftVisible, centerVisible: false, rightVisible: false, leftPx, centerPx: 0, rightPx: 0 };
  }

  // handle === 'R'
  if (!rightVisible) {
    rightVisible = true;
    rightPx = MIN_RIGHT_PX;
  }

  // deltaX > 0：分界线右移 -> right 变窄；deltaX < 0：分界线左移 -> right 变宽
  const desiredRight = snapshot.rightPx - deltaX;
  if (desiredRight < MIN_RIGHT_PX) {
    hideRight();
    const visibleFlags = { leftVisible, centerVisible, rightVisible };
    const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
    if (centerVisible && leftVisible) {
      leftPx = clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
      centerPx = Math.max(MIN_CENTER_PX, totalAfter - leftPx);
      return { leftVisible, centerVisible, rightVisible, leftPx, centerPx: totalAfter - leftPx, rightPx: 0 };
    }
    if (centerVisible) return { leftVisible: false, centerVisible, rightVisible, leftPx: 0, centerPx: totalAfter, rightPx: 0 };
    if (leftVisible) return { leftVisible, centerVisible: false, rightVisible, leftPx: clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX), centerPx: 0, rightPx: 0 };
    return { leftVisible: false, centerVisible: false, rightVisible: false, leftPx: 0, centerPx: 0, rightPx: 0 };
  }

  rightPx = desiredRight;

  if (!centerVisible) {
    // center 关闭时不走 R 拖拽（界面也不会给这个拖拽点），这里兜底保持 right。
    return { leftVisible, centerVisible: false, rightVisible, leftPx: leftVisible ? clamp(snapshot.leftPx, MIN_LEFT_PX, MAX_LEFT_PX) : 0, centerPx: 0, rightPx };
  }

  // center 存在：先压 center，center 到最小后再压 left，left 到最小后收起 left。
  centerPx = snapshot.centerPx + deltaX;
  leftPx = leftVisible ? snapshot.leftPx : 0;

  if (centerPx < MIN_CENTER_PX) {
    const deficit = MIN_CENTER_PX - centerPx;
    centerPx = MIN_CENTER_PX;
    if (leftVisible) leftPx = leftPx - deficit;
  }

  if (leftVisible && leftPx < MIN_LEFT_PX) {
    hideLeft();
    const visibleFlags = { leftVisible, centerVisible, rightVisible };
    const totalAfter = Math.max(0, snapshot.containerWidthPx - splitterCountFlags(visibleFlags) * SPLITTER_PX);
    centerPx = Math.max(MIN_CENTER_PX, totalAfter - rightPx);
    return { leftVisible, centerVisible, rightVisible, leftPx: 0, centerPx: totalAfter - rightPx, rightPx };
  }

  return { leftVisible, centerVisible, rightVisible, leftPx, centerPx, rightPx };
}

let openProjectSeq = 0;
let openFileSeq = 0;

const SELF_WRITE_SILENCE_MS = 800;
const selfWriteAtByPath = new Map<string, number>();
let suppressExternalChangePromptPath: string | null = null;

function detectSep(p: string) {
  return p.includes('/') ? '/' : '\\';
}

function joinPath(base: string, ...rest: string[]) {
  const sep = detectSep(base);
  const parts = [base, ...rest].filter(Boolean).map((s) => s.replace(/[\\/]+$/g, '').replace(/^[\\/]+/g, ''));
  if (parts.length === 0) return '';
  const [first, ...tail] = parts;
  return [first, ...tail].join(sep);
}

function basename(p: string) {
  const sep = detectSep(p);
  const normalized = p.replace(/[\\/]+$/g, '');
  const idx = normalized.lastIndexOf(sep);
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function extname(p: string) {
  const b = basename(p);
  const idx = b.lastIndexOf('.');
  if (idx <= 0) return '';
  return b.slice(idx).toLowerCase();
}

function dirname(p: string) {
  const sep = detectSep(p);
  const normalized = p.replace(/[\\/]+$/g, '');
  const idx = normalized.lastIndexOf(sep);
  if (idx < 0) return normalized;
  if (idx === 0) return sep;
  return normalized.slice(0, idx);
}

function normalizeFsPath(p: string) {
  return p.replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase();
}

type ProjectTab = AppViewModel['projects']['openTabs'][number];

// 最近激活的项目页签（仅用于“关闭后切回上一个项目”的回退规则；不进 ViewModel）。
let projectTabActivationHistory: string[] = restoredProjectsSession?.activeTabId ? [restoredProjectsSession.activeTabId] : [];

function recordProjectTabActivation(tabId: string | null) {
  if (!tabId) return;
  projectTabActivationHistory = [tabId, ...projectTabActivationHistory.filter((id) => id !== tabId)].slice(0, 20);
}

function removeProjectTabFromHistory(tabId: string) {
  projectTabActivationHistory = projectTabActivationHistory.filter((id) => id !== tabId);
}

function pickMostRecentExistingProjectTabId(args: { availableTabs: ProjectTab[]; excludedId: string }): string | null {
  const available = new Set(args.availableTabs.map((t) => t.id));
  for (const id of projectTabActivationHistory) {
    if (id === args.excludedId) continue;
    if (available.has(id)) return id;
  }
  return null;
}

function pickNeighborProjectTabId(args: { tabsBefore: ProjectTab[]; tabsAfter: ProjectTab[]; closedId: string }): string | null {
  const available = new Set(args.tabsAfter.map((t) => t.id));
  const idx = args.tabsBefore.findIndex((t) => t.id === args.closedId);
  if (idx < 0) return args.tabsAfter[0]?.id ?? null;

  for (let i = idx + 1; i < args.tabsBefore.length; i++) {
    const id = args.tabsBefore[i]?.id;
    if (id && available.has(id)) return id;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const id = args.tabsBefore[i]?.id;
    if (id && available.has(id)) return id;
  }
  return args.tabsAfter[0]?.id ?? null;
}

function isSamePathOrNull(a: string | null, b: string | null) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return normalizeFsPath(a) === normalizeFsPath(b);
}

function isWithinRoot(candidatePath: string, root: string) {
  const c = normalizeFsPath(candidatePath);
  const r = normalizeFsPath(root);
  if (c === r) return true;
  const prefix = r.endsWith('/') ? r : `${r}/`;
  return c.startsWith(prefix);
}

const defaultIgnoredNames = new Set(['node_modules', '.git', 'dist', 'out']);

function isIgnoredEntryName(name: string): boolean {
  if (defaultIgnoredNames.has(name)) return true;
  if (name.startsWith('.tmp-') || name.startsWith('tmp-') || name.startsWith('tmp_')) return true;
  return false;
}

function toExplorerNodes(entries: { name: string; path: string; kind: 'dir' | 'file' }[]): ExplorerNodeVM[] {
  return entries.map((e) => ({ id: e.path, name: e.name, kind: e.kind, isIgnored: isIgnoredEntryName(e.name) }));
}

function mergeExplorerChildren(prev: ExplorerNodeVM[] | undefined, next: ExplorerNodeVM[]): ExplorerNodeVM[] {
  if (!prev || prev.length === 0) return next;
  const byId = new Map(prev.map((n) => [n.id, n]));
  return next.map((n) => {
    const old = byId.get(n.id);
    if (!old) return n;
    if (n.kind !== 'dir') return n;
    return { ...n, children: old.children, isLoading: old.isLoading, error: old.error };
  });
}

function updateNodeById(
  nodes: ExplorerNodeVM[],
  id: string,
  updater: (node: ExplorerNodeVM) => ExplorerNodeVM
): ExplorerNodeVM[] {
  return nodes.map((n) => {
    if (n.id === id) return updater(n);
    if (!n.children) return n;
    const nextChildren = updateNodeById(n.children, id, updater);
    if (nextChildren === n.children) return n;
    return { ...n, children: nextChildren };
  });
}

function findNodeById(nodes: ExplorerNodeVM[], id: string): ExplorerNodeVM | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (!n.children) continue;
    const hit = findNodeById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

function detectContentKind(filePath: string): ContentKind {
  const lower = filePath.toLowerCase();
  const name = basename(filePath).toLowerCase();
  if (name === 'tasks.md' || name === 'work.md' || name === '02-任务.md' || name === '03-任务.md') return 'task';
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/.test(lower)) return 'image';
  if (lower.endsWith('.md')) return 'markdown';

  // 关键处理节点：二进制文件一律不预览（避免读入/转码导致卡死）。
  // 这里只做“按扩展名”的保护；不做大小阈值限制（按产品诉求允许打开大文本）。
  const ext = extname(filePath);
  if (
    ext === '.exe' ||
    ext === '.dll' ||
    ext === '.msi' ||
    ext === '.bin' ||
    ext === '.dat' ||
    ext === '.zip' ||
    ext === '.rar' ||
    ext === '.7z' ||
    ext === '.tar' ||
    ext === '.gz' ||
    ext === '.tgz' ||
    ext === '.bz2' ||
    ext === '.xz' ||
    ext === '.pdf' ||
    ext === '.db' ||
    ext === '.sqlite' ||
    ext === '.sqlite3' ||
    ext === '.woff' ||
    ext === '.woff2' ||
    ext === '.ttf' ||
    ext === '.otf'
  ) {
    return 'binary';
  }
  return 'text';
}

function defaultContentMode(kind: ContentKind): ContentMode {
  if (kind === 'task') return 'task' as const;
  if (kind === 'markdown') return 'view' as const;
  if (kind === 'image') return 'view' as const;
  if (kind === 'binary') return 'view' as const;
  return 'editor' as const;
}

const EMPTY_TASK_DETAIL: TaskBoardVM['detail'] = { isOpen: false, mode: 'view', draftTitle: '', draftBody: '' };

function detectNewline(text: string) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeNewlines(text: string, newline: string) {
  if (!text) return '';
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (newline === '\n') return normalized;
  return normalized.replaceAll('\n', newline);
}

function firstSentence(text: string) {
  const s = text.trim();
  if (!s) return '';
  const idx = s.search(/[。；;.!?]/);
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}

function extractTaskSummary(blockText: string) {
  const main = blockText.trimEnd().replaceAll('\r\n', '\n');
  const lines = main.split('\n');
  for (const line of lines) {
    const m1 = line.match(/^\s*[-*+]\s*做什么[：:]\s*(.*)$/);
    if (m1?.[1]) return firstSentence(m1[1]);
    const m2 = line.match(/^\s*做什么[：:]\s*(.*)$/);
    if (m2?.[1]) return firstSentence(m2[1]);
  }

  // fallback：取任务块里第一条“有内容”的描述（跳过嵌套任务行）
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^[-*+]\s*\[[ xX]\]\s+/.test(trimmed)) continue;
    const cleaned = trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!cleaned) continue;
    return firstSentence(cleaned);
  }

  return '';
}

function taskIdFromTitle(title: string, fallbackPos: number) {
  const m = title.match(/\bT-\d{3}\b/);
  if (m?.[0]) return `task-${m[0]}`;
  return `task-${fallbackPos}`;
}

function extractTaskDrafts(fullText: string, item: TaskItemVM) {
  const blockText = fullText.slice(item.source.blockStartPos, item.source.blockEndPos);
  const trimmed = blockText.trimEnd();
  const main = trimmed.replaceAll('\r\n', '\n');
  const nlIdx = main.indexOf('\n');
  const body = nlIdx < 0 ? '' : main.slice(nlIdx + 1).trimEnd();
  const title = fullText.slice(item.source.titleStartPos, item.source.titleEndPos).replace(/\r$/, '');
  return { title, body };
}

/**
 * 解析任务块中的关联引用
 * 匹配 "关联需求：REQ-001, AC-001, AC-002" 或 "关联需求: REQ-001, AC-001"
 */
function parseLinkedRefs(blockText: string): string[] {
  const match = blockText.match(/关联需求[：:]\s*(.+)$/m);
  if (!match?.[1]) return [];

  // 分割并清理，支持中英文逗号和分号
  return match[1]
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter((s) => /^(REQ|AC)-\d+$/.test(s));
}

/**
 * 从文档中提取 REQ-xxx / AC-xxx 段落
 */
function extractDocSection(
  docText: string,
  refId: string
): { title: string; content: string; lineNumber: number } | null {
  const lines = docText.split('\n');

  if (refId.startsWith('REQ-')) {
    // 查找 "### REQ-001" 开头的段落
    const pattern = new RegExp(`^###\\s+${refId}\\b`);
    const startIdx = lines.findIndex((line) => pattern.test(line));
    if (startIdx < 0) return null;

    // 提取标题（去掉 ### REQ-xxx 前缀）
    const titleLine = lines[startIdx] ?? '';
    const title = titleLine.replace(/^###\s+REQ-\d+\s*/, '').trim();

    // 找到下一个 ## 或 ### 标题，或文档结束
    let endIdx = lines.findIndex((line, i) => i > startIdx && /^#{2,3}\s+/.test(line));
    if (endIdx < 0) endIdx = lines.length;

    return {
      title,
      content: lines.slice(startIdx, endIdx).join('\n').trim(),
      lineNumber: startIdx + 1
    };
  }

  if (refId.startsWith('AC-')) {
    // 查找 "- **AC-001**" 开头的行
    const pattern = new RegExp(`^-\\s+\\*\\*${refId}\\*\\*`);
    const lineIdx = lines.findIndex((line) => pattern.test(line));
    if (lineIdx < 0) return null;

    // AC 可能有子列表，需要找到下一个同级或更高级的列表项
    let endIdx = lineIdx + 1;
    while (endIdx < lines.length) {
      const line = lines[endIdx] ?? '';
      // 遇到下一个 AC 项、空行后的非缩进内容、或标题，则结束
      if (/^-\s+\*\*AC-\d+\*\*/.test(line)) break;
      if (/^#{1,3}\s+/.test(line)) break;
      // 空行后如果下一行不是缩进的，也结束
      if (line.trim() === '' && endIdx + 1 < lines.length) {
        const nextLine = lines[endIdx + 1] ?? '';
        if (nextLine.trim() && !nextLine.startsWith('  ') && !nextLine.startsWith('\t')) {
          break;
        }
      }
      endIdx++;
    }

    const content = lines.slice(lineIdx, endIdx).join('\n').trim();

    return {
      title: refId,
      content,
      lineNumber: lineIdx + 1
    };
  }

  return null;
}

/**
 * 加载关联文档内容
 * 从当前任务文件同目录的 01-需求.md 中提取关联的 REQ/AC 内容
 */
async function loadLinkedDocs(
  taskFilePath: string,
  linkedRefs: string[]
): Promise<LinkedDocVM[]> {
  if (!linkedRefs.length) return [];

  const api = window.specwave;
  if (!api) return [];

  // 从任务文件路径推导需求文件路径（同目录的 01-需求.md）
  const dirPath = taskFilePath.replace(/[/\\][^/\\]+$/, '');
  const reqFilePath = `${dirPath}/01-需求.md`;

  // 读取需求文件
  const res = await api.readTextFile(reqFilePath);
  if (!res.ok) return [];

  const docs: LinkedDocVM[] = [];

  for (const refId of linkedRefs) {
    const section = extractDocSection(res.text, refId);
    if (!section) continue;

    docs.push({
      refId,
      type: refId.startsWith('REQ-') ? 'req' : 'ac',
      title: section.title,
      content: section.content,
      sourceFile: '01-需求.md',
      lineNumber: section.lineNumber
    });
  }

  return docs;
}

function parseTaskBoardV2(text: string, prev: TaskBoardVM | null): TaskBoardVM {
  const items: TaskItemVM[] = [];
  const re = /^(?<indent>[ \t]*)-\s*\[(?<status>[ xX])\]\s+(?<label>.*)$/gm;
  const hits: Array<{
    lineStartPos: number;
    rawLine: string;
    level: number;
    checked: boolean;
    title: string;
    statusPos: number;
    titleStartPos: number;
    titleEndPos: number;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineStartPos = m.index;
    const rawLine = m[0] ?? '';
    const indent = m.groups?.indent ?? '';
    const checked = (m.groups?.status ?? ' ').toLowerCase() === 'x';
    const title = (m.groups?.label ?? '').replace(/\r$/, '');

    const bracketIdx = rawLine.indexOf('[');
    if (bracketIdx < 0) continue;
    const statusPos = lineStartPos + bracketIdx + 1;

    const rawLineNoCr = rawLine.replace(/\r$/, '');
    const titleStartInLine = rawLineNoCr.length - title.length;
    const titleStartPos = lineStartPos + Math.max(0, titleStartInLine);
    const titleEndPos = titleStartPos + title.length;
    const level = Math.max(0, Math.floor(indent.length / 2));

    hits.push({ lineStartPos, rawLine, level, checked, title, statusPos, titleStartPos, titleEndPos });
  }

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const next = (() => {
      for (let j = i + 1; j < hits.length; j++) {
        const cand = hits[j]!;
        if (cand.level <= h.level) return cand;
      }
      return null;
    })();
    const blockStartPos = h.lineStartPos;
    const blockEndPos = next ? next.lineStartPos : text.length;
    const blockText = text.slice(blockStartPos, blockEndPos);
    const body = (() => {
      const main = blockText.trimEnd().replaceAll('\r\n', '\n');
      const nlIdx = main.indexOf('\n');
      if (nlIdx < 0) return '';
      // 移除"关联需求"行，避免与 badge 区域重复显示
      return main
        .slice(nlIdx + 1)
        .split('\n')
        .filter((line) => !/^[-\s]*关联需求[：:]/.test(line))
        .join('\n')
        .trimEnd();
    })();

    items.push({
      id: taskIdFromTitle(h.title, h.statusPos),
      title: h.title,
      summary: extractTaskSummary(blockText),
      body,
      checked: h.checked,
      level: h.level,
      source: {
        statusPos: h.statusPos,
        titleStartPos: h.titleStartPos,
        titleEndPos: h.titleEndPos,
        blockStartPos,
        blockEndPos
      },
      linkedRefs: parseLinkedRefs(blockText)
    });
  }

  const nextDeckMode: TaskBoardVM['deckMode'] = prev?.deckMode ?? 'single';

  const nextActiveTaskId = (() => {
    const prevId = prev?.activeTaskId;
    if (prevId && items.some((t) => t.id === prevId)) return prevId;
    return items[0]?.id ?? null;
  })();

  const nextDetail = (() => {
    if (!nextActiveTaskId) return EMPTY_TASK_DETAIL;
    if (!prev?.detail.isOpen) return EMPTY_TASK_DETAIL;
    if (prev.activeTaskId !== nextActiveTaskId) return EMPTY_TASK_DETAIL;
    if (prev.detail.mode === 'edit') return prev.detail;
    const item = items.find((t) => t.id === nextActiveTaskId);
    if (!item) return EMPTY_TASK_DETAIL;
    const { title, body } = extractTaskDrafts(text, item);
    return { isOpen: true, mode: 'view' as const, draftTitle: title, draftBody: body };
  })();

  return { 
    items, 
    activeTaskId: nextActiveTaskId, 
    deckMode: nextDeckMode, 
    detail: nextDetail,
    linkedDocs: [],
    linkedDocsLoading: false,
    linkedDocsError: null
  };
}

function toggleCharAt(text: string, pos: number, nextChar: string) {
  if (pos < 0 || pos >= text.length) return text;
  return text.slice(0, pos) + nextChar + text.slice(pos + 1);
}

function effectiveContentText(content: AppViewModel['content']) {
  return content.isDirty ? content.draftText : content.text;
}

function findMatchStarts(text: string, query: string) {
  const q = query.trim();
  if (!q) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const hits: number[] = [];
  let idx = 0;
  while (idx <= lowerText.length - lowerQuery.length) {
    const next = lowerText.indexOf(lowerQuery, idx);
    if (next < 0) break;
    hits.push(next);
    idx = next + Math.max(1, lowerQuery.length);
  }
  return hits;
}

export const useAppStore = create<AppState>((set, get) => ({
  vm: initialVm,
  intentLog: [],
  drag: null,
  dispatch: (intent) => {
    set((state) => ({ intentLog: [`${new Date().toLocaleTimeString()} ${intent.type}`, ...state.intentLog].slice(0, 30) }));

    set((state) => {
      const vm = state.vm;
      const drag = state.drag;

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
        case 'APP_QUIT_REQUEST': {
          void (async () => {
            const api = window.specwave;
            if (api?.quitApp) {
              await api.quitApp();
              return;
            }
            window.close();
          })();
          return { vm };
        }
        case 'RIGHT_MODE_SET':
          {
            const nextVm = { ...vm, rightMode: intent.mode, rightVisible: true };
            const nextLayout = normalizeLayoutStable(nextVm);
            return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
          }
        case 'GLOBAL_SEARCH_SET':
          return { vm: { ...vm, globalSearchQuery: intent.query } };
        case 'PROJECT_TAB_ADD_EMPTY': {
          const tabId = `proj-empty-${Date.now()}`;
          const nextProjects: AppViewModel['projects'] = {
            openTabs: [...vm.projects.openTabs, { id: tabId, folderName: '未打开', path: null }],
            activeTabId: tabId
          };
          recordProjectTabActivation(tabId);
          persistProjectsSession(nextProjects);
          return {
            vm: {
              ...vm,
              app: { ...vm.app, mode: 'main' },
              projects: nextProjects,
              explorer: { ...initialVm.explorer, showIgnored: vm.explorer.showIgnored },
              content: { ...initialVm.content }
            }
          };
        }
        case 'PROJECT_SELECT': {
          const seq = ++openProjectSeq;
          void (async () => {
            const api = window.specwave;
            if (!api) {
              set((s) => ({
                vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: '未检测到桌面端 API（preload 未注入）。' } }
              }));
              return;
            }

            const dirPath = await api.selectDirectory();
            if (!dirPath) {
              set((s) => ({ vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false } } }));
              return;
            }

            if (specwaveWindowKind === 'welcome' && api.openMainWindow) {
              try {
                await api.openMainWindow(dirPath);
              } catch (err) {
                set((s) => ({
                  vm: {
                    ...s.vm,
                    explorer: {
                      ...s.vm.explorer,
                      isLoading: false,
                      error: `打开主窗口失败：${err instanceof Error ? err.message : String(err)}`
                    }
                  }
                }));
              }
              return;
            }

            // 关键处理节点：主窗口启动后才选择项目时，终端会话可能已经用 process.cwd() 启动在 apps/desktop。
            // 这里在“用户首次打开项目”时，把未输入过的终端会话重建到项目根目录，避免提示符路径误导。
            if (specwaveWindowKind === 'main' && !bootProjectPath) {
              await restartIdleTerminalSessionsToCwd({
                api,
                cwd: dirPath,
                terminalIds: get().vm.terminal.panelIds,
                setState: set
              });
            }

            const projectName = basename(dirPath);
            const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

            const tabId = (() => {
              const current = get().vm.projects;
              const active = current.activeTabId ? current.openTabs.find((t) => t.id === current.activeTabId) : null;
              if (active && active.path == null) return active.id;
              return `proj-${Date.now()}`;
            })();

            const [workspaceRes, projectRes] = await Promise.all([api.readDirectory(workspaceRoot), api.readDirectory(dirPath)]);
            if (seq !== openProjectSeq) return;

            if (!projectRes.ok) {
              set((s) => ({
                vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: `项目目录读取失败：${projectRes.error}` } }
              }));
              return;
            }

            const workspaceNodes = workspaceRes.ok ? toExplorerNodes(workspaceRes.entries) : [];
            const projectNodes = toExplorerNodes(projectRes.entries);

            const workspaceError = workspaceRes.ok
              ? null
              : workspaceRes.error.includes('ENOENT')
                ? null
                : `工作区读取失败：${workspaceRes.error}`;

            if (api.fsWatchStart) {
              void api.fsWatchStart({ workspaceRoot: workspaceRes.ok ? workspaceRoot : null, projectRoot: dirPath });
            }

            const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : get().vm.app.recentProjects;
            if (seq !== openProjectSeq) return;

            set((state) => {
              const vm2 = state.vm;
              const existing = vm2.projects.openTabs.find((t) => t.id === tabId);
              const nextTabs = existing
                ? vm2.projects.openTabs.map((t) => (t.id === tabId ? { ...t, folderName: projectName, path: dirPath } : t))
                : [...vm2.projects.openTabs, { id: tabId, folderName: projectName, path: dirPath }];
              const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: tabId };

              recordProjectTabActivation(tabId);
              persistProjectsSession(nextProjects);

              return {
                vm: {
                  ...vm2,
                  app: { mode: 'main', recentProjects },
                  projects: nextProjects,
                  explorer: {
                    workspaceRoot: workspaceRes.ok ? workspaceRoot : null,
                    projectRoot: dirPath,
                    workspace: workspaceNodes,
                    project: projectNodes,
                    expanded: { workspace: [], project: [] },
                    selectedPath: null,
                    showIgnored: vm2.explorer.showIgnored,
                    isLoading: false,
                    error: workspaceError
                  },
                  content: { ...initialVm.content }
                }
              };
            });
          })();

          return { vm: { ...vm, explorer: { ...vm.explorer, isLoading: true, error: null } } };
        }
        case 'PROJECT_OPEN_RECENT': {
          const seq = ++openProjectSeq;
          const dirPath = intent.path;
          void (async () => {
             const api = window.specwave;
             if (!api) {
               set((s) => ({
                 vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: '未检测到桌面端 API（preload 未注入）。' } }
               }));
               return;
             }

              if (specwaveWindowKind === 'welcome' && api.openMainWindow) {
                try {
                  await api.openMainWindow(dirPath);
                } catch (err) {
                 set((s) => ({
                   vm: {
                     ...s.vm,
                     explorer: {
                       ...s.vm.explorer,
                       isLoading: false,
                       error: `打开主窗口失败：${err instanceof Error ? err.message : String(err)}`
                     }
                   }
                 }));
               }
                return;
              }

              if (specwaveWindowKind === 'main' && !bootProjectPath) {
                await restartIdleTerminalSessionsToCwd({
                  api,
                  cwd: dirPath,
                  terminalIds: get().vm.terminal.panelIds,
                  setState: set
                });
              }

              const projectName = basename(dirPath);
              const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

             const tabId = (() => {
               const current = get().vm.projects;
               const active = current.activeTabId ? current.openTabs.find((t) => t.id === current.activeTabId) : null;
               if (active && active.path == null) return active.id;
               return `proj-${Date.now()}`;
             })();

            const [workspaceRes, projectRes] = await Promise.all([api.readDirectory(workspaceRoot), api.readDirectory(dirPath)]);
            if (seq !== openProjectSeq) return;

            if (!projectRes.ok) {
              set((s) => ({
                vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: `项目目录读取失败：${projectRes.error}` } }
              }));
              return;
            }

            const workspaceNodes = workspaceRes.ok ? toExplorerNodes(workspaceRes.entries) : [];
            const projectNodes = toExplorerNodes(projectRes.entries);

            const workspaceError = workspaceRes.ok
              ? null
              : workspaceRes.error.includes('ENOENT')
                ? null
                : `工作区读取失败：${workspaceRes.error}`;

            if (api.fsWatchStart) {
              void api.fsWatchStart({ workspaceRoot: workspaceRes.ok ? workspaceRoot : null, projectRoot: dirPath });
            }

            const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : get().vm.app.recentProjects;
            if (seq !== openProjectSeq) return;

            set((state) => {
              const vm2 = state.vm;
              const existing = vm2.projects.openTabs.find((t) => t.id === tabId);
              const nextTabs = existing
                ? vm2.projects.openTabs.map((t) => (t.id === tabId ? { ...t, folderName: projectName, path: dirPath } : t))
                : [...vm2.projects.openTabs, { id: tabId, folderName: projectName, path: dirPath }];
              const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: tabId };

              recordProjectTabActivation(tabId);
              persistProjectsSession(nextProjects);

              return {
                vm: {
                  ...vm2,
                  app: { mode: 'main', recentProjects },
                  projects: nextProjects,
                  explorer: {
                    workspaceRoot: workspaceRes.ok ? workspaceRoot : null,
                    projectRoot: dirPath,
                    workspace: workspaceNodes,
                    project: projectNodes,
                    expanded: { workspace: [], project: [] },
                    selectedPath: null,
                    showIgnored: vm2.explorer.showIgnored,
                    isLoading: false,
                    error: workspaceError
                  },
                  content: { ...initialVm.content }
                }
              };
            });
          })();

          return { vm: { ...vm, explorer: { ...vm.explorer, isLoading: true, error: null } } };
        }
        case 'RECENT_PROJECT_REMOVE': {
          void (async () => {
            const api = window.specwave;
            if (!api?.removeRecentProject) return;
            const recentProjects = await api.removeRecentProject(intent.path);
            set((state) => ({ vm: { ...state.vm, app: { ...state.vm.app, recentProjects } } }));
          })();
          return { vm };
        }
        case 'PROJECT_TAB_SET_ACTIVE': {
          const targetTab = vm.projects.openTabs.find((t) => t.id === intent.id);
          if (!targetTab) return { vm };

          // 关键处理节点：关闭 active tab 后我们会先更新 activeTabId，再触发一次 PROJECT_TAB_SET_ACTIVE 做“下方三栏”恢复。
          // 如果这里仅凭 “id 相等”就短路，会出现“顶部页签切回了，但文件树/内容区/终端没恢复”的断层。
          const isAlreadyActive = intent.id === vm.projects.activeTabId;
          if (isAlreadyActive && isSamePathOrNull(vm.explorer.projectRoot, targetTab.path)) return { vm };

          recordProjectTabActivation(targetTab.id);

          if (targetTab.path == null) {
            void window.specwave?.fsWatchStart?.({ workspaceRoot: null, projectRoot: null });
            const nextProjects: AppViewModel['projects'] = { ...vm.projects, activeTabId: targetTab.id };
            persistProjectsSession(nextProjects);
            return {
              vm: {
                ...vm,
                app: { ...vm.app, mode: 'main' },
                projects: nextProjects,
                explorer: { ...initialVm.explorer, showIgnored: vm.explorer.showIgnored },
                content: { ...initialVm.content }
              }
            };
          }

          const seq = ++openProjectSeq;
          const dirPath = targetTab.path;
          const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');
          void (async () => {
            const api = window.specwave;
            if (!api) return;

            const [workspaceRes, projectRes] = await Promise.all([api.readDirectory(workspaceRoot), api.readDirectory(dirPath)]);
            if (seq !== openProjectSeq) return;
            if (!projectRes.ok) {
              set((s) => ({
                vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: `项目目录读取失败：${projectRes.error}` } }
              }));
              return;
            }

            const workspaceNodes = workspaceRes.ok ? toExplorerNodes(workspaceRes.entries) : [];
            const projectNodes = toExplorerNodes(projectRes.entries);
            const workspaceError = workspaceRes.ok
              ? null
              : workspaceRes.error.includes('ENOENT')
                ? null
                : `工作区读取失败：${workspaceRes.error}`;

            if (api.fsWatchStart) {
              void api.fsWatchStart({ workspaceRoot: workspaceRes.ok ? workspaceRoot : null, projectRoot: dirPath });
            }

            const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : get().vm.app.recentProjects;
            if (seq !== openProjectSeq) return;

            set((state) => {
              const vm2 = state.vm;
              if (vm2.projects.activeTabId !== targetTab.id) return { vm: vm2 };
              return {
                vm: {
                  ...vm2,
                  app: { mode: 'main', recentProjects },
                  explorer: {
                    workspaceRoot: workspaceRes.ok ? workspaceRoot : null,
                    projectRoot: dirPath,
                    workspace: workspaceNodes,
                    project: projectNodes,
                    expanded: { workspace: [], project: [] },
                    selectedPath: null,
                    showIgnored: vm2.explorer.showIgnored,
                    isLoading: false,
                    error: workspaceError
                  },
                  content: { ...initialVm.content }
                }
              };
            });
          })();

          const nextProjects: AppViewModel['projects'] = { ...vm.projects, activeTabId: targetTab.id };
          persistProjectsSession(nextProjects);
          return {
            vm: {
              ...vm,
              app: { ...vm.app, mode: 'main' },
              projects: nextProjects,
              explorer: {
                ...initialVm.explorer,
                showIgnored: vm.explorer.showIgnored,
                workspaceRoot,
                projectRoot: dirPath,
                isLoading: true,
                error: null
              },
              content: { ...initialVm.content }
            }
          };
        }
        case 'PROJECT_TAB_CLOSE': {
          const tabsBefore = vm.projects.openTabs;
          const nextTabs = tabsBefore.filter((t) => t.id !== intent.id);
          const wasActive = vm.projects.activeTabId === intent.id;

          removeProjectTabFromHistory(intent.id);

          // 关闭 active tab 后优先切回“上一次激活的项目”；没有历史再按相邻规则（右优先，其次左），最后才兜底取第一个。
          const nextActive = wasActive
            ? (pickMostRecentExistingProjectTabId({ availableTabs: nextTabs, excludedId: intent.id }) ??
              pickNeighborProjectTabId({ tabsBefore, tabsAfter: nextTabs, closedId: intent.id }))
            : vm.projects.activeTabId;

          const isEmpty = nextTabs.length === 0;
          if (!isEmpty) {
            const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: nextActive };
            if (wasActive) recordProjectTabActivation(nextActive);
            persistProjectsSession(nextProjects);

            const nextVm = { ...vm, projects: nextProjects };
            if (wasActive && nextActive) {
              queueMicrotask(() => get().dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: nextActive }));
            }
            return { vm: nextVm };
          }

          persistProjectsSession({ openTabs: [], activeTabId: null });

          if (specwaveWindowKind === 'main') {
            void window.specwave?.fsWatchStart?.({ workspaceRoot: null, projectRoot: null });
            void (async () => {
              const api = window.specwave;
              if (api?.openWelcomeWindow) {
                try {
                  await api.openWelcomeWindow();
                  return;
                } catch {}
              }

              set((s) => ({
                vm: {
                  ...s.vm,
                  app: { ...s.vm.app, mode: 'welcome' },
                  projects: { openTabs: [], activeTabId: null },
                  explorer: { ...initialVm.explorer, showIgnored: s.vm.explorer.showIgnored },
                  content: { ...initialVm.content }
                }
              }));
            })();
            return { vm };
          }

          return {
            vm: {
              ...vm,
              app: { ...vm.app, mode: 'welcome' },
              projects: { openTabs: [], activeTabId: null },
              explorer: { ...initialVm.explorer, showIgnored: vm.explorer.showIgnored },
              content: { ...initialVm.content }
            }
          };
        }
        case 'EXPLORER_SHOW_IGNORED_SET': {
          const nextShowIgnored = intent.showIgnored;
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem('specwave_explorer_show_ignored', nextShowIgnored ? '1' : '0');
            } catch {}
          }
          return { vm: { ...vm, explorer: { ...vm.explorer, showIgnored: nextShowIgnored } } };
        }
        case 'EXPLORER_TOGGLE_DIR': {
          const tree = intent.tree;
          const expanded = vm.explorer.expanded[tree];
          const isExpanded = expanded.includes(intent.id);
          const nextExpanded = isExpanded ? expanded.filter((x) => x !== intent.id) : [...expanded, intent.id];

          const treeNodes = tree === 'workspace' ? vm.explorer.workspace : vm.explorer.project;
          const target = findNodeById(treeNodes, intent.id);

          if (!isExpanded && target?.kind === 'dir' && target.children == null && !target.isLoading) {
            const loadingNodes = updateNodeById(treeNodes, intent.id, (n) => ({ ...n, isLoading: true, error: undefined }));
            void (async () => {
              const api = window.specwave;
              if (!api) return;
              const res = await api.readDirectory(intent.id);
              set((state) => {
                const vm2 = state.vm;
                const nodes2 = tree === 'workspace' ? vm2.explorer.workspace : vm2.explorer.project;
                const nextNodes = updateNodeById(nodes2, intent.id, (n) => ({
                  ...n,
                  isLoading: false,
                  children: res.ok ? toExplorerNodes(res.entries) : [],
                  error: res.ok ? undefined : res.error
                }));
                return {
                  vm: {
                    ...vm2,
                    explorer: { ...vm2.explorer, [tree]: nextNodes }
                  }
                };
              });
            })();

            return {
              vm: {
                ...vm,
                explorer: {
                  ...vm.explorer,
                  expanded: { ...vm.explorer.expanded, [tree]: nextExpanded },
                  [tree]: loadingNodes
                }
              }
            };
          }

          return { vm: { ...vm, explorer: { ...vm.explorer, expanded: { ...vm.explorer.expanded, [tree]: nextExpanded } } } };
        }
        case 'EXPLORER_OPEN_FILE': {
          const seq = ++openFileSeq;
          const filePath = intent.path;
          const kind = detectContentKind(filePath);
          suppressExternalChangePromptPath = null;

          // 关键处理节点：开发模式可能被 full reload 打断，这里先把“最后打开的文件”同步写进 sessionStorage，保证能恢复回来。
          try {
            persistUiSession({
              leftVisible: vm.leftVisible,
              centerVisible: true,
              rightVisible: vm.rightVisible,
              rightMode: vm.rightMode,
              explorerExpanded: vm.explorer.expanded,
              explorerSelectedPath: filePath,
              lastOpenFilePath: filePath,
              projectRoot: vm.explorer.projectRoot,
              workspaceRoot: vm.explorer.workspaceRoot
            });
          } catch {}

          if (kind === 'binary') {
            return {
              vm: {
                ...vm,
                centerVisible: true,
                explorer: { ...vm.explorer, selectedPath: filePath },
                content: {
                  ...vm.content,
                  find: { ...initialVm.content.find },
                  file: { path: filePath, name: basename(filePath), kind, sha256: '' },
                  text: '',
                  draftText: '',
                  mode: 'view',
                  isDirty: false,
                  saveStatus: 'idle',
                  saveError: null,
                  taskBoard: null
                }
              }
            };
          }

          void (async () => {
            const api = window.specwave;
            if (!api) return;

            const res = await (async () => {
              if (kind !== 'image') return api.readTextFile(filePath);
              if (!api.readBinaryFile) return { ok: false, error: '当前桌面端版本不支持图片预览。' } as const;
              const bin = await api.readBinaryFile(filePath);
              if (!bin.ok) return { ok: false, error: bin.error } as const;
              return { ok: true, text: `data:${bin.mime};base64,${bin.base64}`, sha256: bin.sha256 } as const;
            })();
            if (seq !== openFileSeq) return;

            set((state) => {
              const vm2 = state.vm;
              if (vm2.explorer.selectedPath !== filePath) return { vm: vm2 };

              if (!res.ok) {
                return {
                  vm: {
                    ...vm2,
                    content: { ...vm2.content, saveStatus: 'error', saveError: res.error }
                  }
                };
              }

              const mode = defaultContentMode(kind);
              const taskBoard = kind === 'task' ? parseTaskBoardV2(res.text, null) : null;

              // 初始加载关联文档
              if (taskBoard && taskBoard.activeTaskId) {
                const activeItem = taskBoard.items.find((t) => t.id === taskBoard.activeTaskId);
                if (activeItem && activeItem.linkedRefs.length > 0) {
                  void (async () => {
                    const linkedDocs = await loadLinkedDocs(filePath, activeItem.linkedRefs);
                    set((state) => {
                      const currentBoard = state.vm.content.taskBoard;
                      if (!currentBoard) return { vm: state.vm };
                      return {
                        vm: {
                          ...state.vm,
                          content: {
                            ...state.vm.content,
                            taskBoard: {
                              ...currentBoard,
                              linkedDocs,
                              linkedDocsLoading: false
                            }
                          }
                        }
                      };
                    });
                  })();
                }
              }

              return {
                vm: {
                  ...vm2,
                  content: {
                    find: { ...initialVm.content.find },
                    file: { path: filePath, name: basename(filePath), kind, sha256: res.sha256 },
                    text: res.text,
                    draftText: res.text,
                    mode,
                    isDirty: false,
                    saveStatus: 'idle',
                    saveError: null,
                    taskBoard
                  }
                }
              };
            });
          })();

          return {
            vm: {
              ...vm,
              centerVisible: true,
              explorer: { ...vm.explorer, selectedPath: filePath },
              content: { ...vm.content, saveStatus: 'idle', saveError: null, find: { ...initialVm.content.find } }
            }
          };
        }
        case 'EXPLORER_REVEAL_IN_OS': {
          void (async () => {
            const api = window.specwave;
            if (!api?.revealInFolder) return;
            try {
              await api.revealInFolder(intent.path);
            } catch {}
          })();
          return { vm };
        }
        case 'CONTENT_TOGGLE_VIEW_MODE': {
          const file = vm.content.file;
          if (!file) return { vm };
          if (file.kind === 'image') return { vm };
          if (file.kind === 'binary') return { vm };
          const effectiveText = vm.content.isDirty ? vm.content.draftText : vm.content.text;

          const nextMode = (() => {
            if (file.kind === 'task') {
              if (vm.content.mode === 'task') return 'view' as const;
              if (vm.content.mode === 'view') return 'editor' as const;
              return 'task' as const;
            }
            if (vm.content.mode === 'view') return 'editor' as const;
            return 'view' as const;
          })();

          const nextTaskBoard =
            file.kind === 'task' && nextMode === 'task' ? parseTaskBoardV2(effectiveText, vm.content.taskBoard) : vm.content.taskBoard;
          return {
            vm: {
              ...vm,
              content: { ...vm.content, mode: nextMode, taskBoard: nextTaskBoard, draftText: effectiveText }
            }
          };
        }
        case 'CONTENT_DRAFT_SET': {
          const file = vm.content.file;
          if (!file) return { vm };
          const nextDraft = intent.text;
          const isDirty = nextDraft !== vm.content.text;
          const nextFind = (() => {
            if (!vm.content.find.isOpen) return vm.content.find;
            const hits = findMatchStarts(nextDraft, vm.content.find.query);
            const nextActive = hits.length ? Math.min(vm.content.find.activeIndex, hits.length - 1) : 0;
            return { ...vm.content.find, matchStarts: hits, activeIndex: nextActive };
          })();
          return {
            vm: {
              ...vm,
              content: { ...vm.content, draftText: nextDraft, isDirty, saveStatus: 'idle', saveError: null, find: nextFind }
            }
          };
        }
        case 'CONTENT_SAVE_REQUEST': {
          const file = vm.content.file;
          if (!file || !vm.content.isDirty) return { vm };

          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const current = get().vm.content.file;
            if (!current || current.path !== file.path) return;
            const text = get().vm.content.draftText;
            const res = await api.saveTextFile(current.path, text, current.sha256);
            if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());

            set((state) => {
              const vm2 = state.vm;
              if (!vm2.content.file || vm2.content.file.path !== file.path) return { vm: vm2 };

              if (!res.ok) {
                if ('conflict' in res && res.conflict) {
                  return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
                }
                return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
              }

              const kind = vm2.content.file.kind;
              const nextText = vm2.content.draftText;
              return {
                vm: {
                  ...vm2,
                  content: {
                    ...vm2.content,
                    text: nextText,
                    isDirty: false,
                    saveStatus: 'saved',
                    saveError: null,
                    file: { ...vm2.content.file, sha256: res.sha256 },
                    taskBoard: kind === 'task' ? parseTaskBoardV2(nextText, vm2.content.taskBoard) : vm2.content.taskBoard
                  }
                }
              };
            });
          })();

          return { vm: { ...vm, content: { ...vm.content, saveStatus: 'saving', saveError: null } } };
        }
        case 'CONTENT_FIND_SET_QUERY': {
          const file = vm.content.file;
          if (!file) return { vm };
          const text = effectiveContentText(vm.content);
          const hits = findMatchStarts(text, intent.query);
          return {
            vm: {
              ...vm,
              centerVisible: true,
              content: {
                ...vm.content,
                find: { isOpen: true, query: intent.query, matchStarts: hits, activeIndex: hits.length ? 0 : 0 }
              }
            }
          };
        }
        case 'CONTENT_FIND_NEXT': {
          const file = vm.content.file;
          if (!file) return { vm };
          const hits = vm.content.find.matchStarts;
          if (!hits.length) return { vm };
          const nextActive = (vm.content.find.activeIndex + 1) % hits.length;
          return { vm: { ...vm, content: { ...vm.content, find: { ...vm.content.find, isOpen: true, activeIndex: nextActive } } } };
        }
        case 'CONTENT_FIND_PREV': {
          const file = vm.content.file;
          if (!file) return { vm };
          const hits = vm.content.find.matchStarts;
          if (!hits.length) return { vm };
          const nextActive = (vm.content.find.activeIndex - 1 + hits.length) % hits.length;
          return { vm: { ...vm, content: { ...vm.content, find: { ...vm.content.find, isOpen: true, activeIndex: nextActive } } } };
        }
        case 'CONTENT_FIND_CLOSE': {
          if (!vm.content.file) return { vm };
          return { vm: { ...vm, content: { ...vm.content, find: { ...initialVm.content.find } } } };
        }
        case 'TASK_ITEM_TOGGLE': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };

          const effectiveText = vm.content.isDirty ? vm.content.draftText : vm.content.text;
          const currentChar = effectiveText[intent.source.statusPos] ?? ' ';
          const nextChar = currentChar.toLowerCase() === 'x' ? ' ' : 'x';
          const nextText = toggleCharAt(effectiveText, intent.source.statusPos, nextChar);

          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const current = get().vm.content.file;
            if (!current || current.path !== file.path) return;
            const res = await api.saveTextFile(current.path, nextText, current.sha256);
            if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());

            set((state) => {
              const vm2 = state.vm;
              if (!vm2.content.file || vm2.content.file.path !== file.path) return { vm: vm2 };

              if (!res.ok) {
                if ('conflict' in res && res.conflict) {
                  return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
                }
                return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
              }

              return {
                vm: {
                  ...vm2,
                  content: {
                    ...vm2.content,
                    text: nextText,
                    draftText: nextText,
                    isDirty: false,
                    saveStatus: 'saved',
                    saveError: null,
                    file: { ...vm2.content.file!, sha256: res.sha256 },
                    taskBoard: parseTaskBoardV2(nextText, vm2.content.taskBoard)
                  }
                }
              };
            });
          })();

          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                draftText: nextText,
                isDirty: true,
                saveStatus: 'saving',
                saveError: null,
                taskBoard: parseTaskBoardV2(nextText, vm.content.taskBoard)
              }
            }
          };
        }
        case 'TASK_ITEM_OPEN': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const text = effectiveContentText(vm.content);
          const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
          const item = board.items.find((t) => t.id === intent.taskId);
          if (!item) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
          const { title, body } = extractTaskDrafts(text, item);
          const nextBoard: TaskBoardVM = {
            ...board,
            activeTaskId: item.id,
            deckMode: 'single',
            detail: { isOpen: true, mode: 'view', draftTitle: title, draftBody: body }
          };
          return { vm: { ...vm, content: { ...vm.content, taskBoard: nextBoard } } };
        }
        case 'TASK_DETAIL_OPEN': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const text = effectiveContentText(vm.content);
          const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
          const item = board.items.find((t) => t.id === intent.taskId);
          if (!item) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
          const { title, body } = extractTaskDrafts(text, item);
          const nextBoard: TaskBoardVM = {
            ...board,
            activeTaskId: item.id,
            detail: { isOpen: true, mode: intent.mode, draftTitle: title, draftBody: body }
          };
          return { vm: { ...vm, content: { ...vm.content, taskBoard: nextBoard } } };
        }
        case 'TASK_DETAIL_CLOSE': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const board = vm.content.taskBoard;
          if (!board) return { vm };
          return { vm: { ...vm, content: { ...vm.content, taskBoard: { ...board, detail: EMPTY_TASK_DETAIL } } } };
        }
        case 'TASK_DECK_MODE_SET': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const text = effectiveContentText(vm.content);
          const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
          const nextActive = board.activeTaskId ?? board.items[0]?.id ?? null;
          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                taskBoard: { ...board, activeTaskId: nextActive, deckMode: intent.mode, detail: EMPTY_TASK_DETAIL }
              }
            }
          };
        }
        case 'TASK_DECK_PREV':
        case 'TASK_DECK_NEXT': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const text = effectiveContentText(vm.content);
          const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
          const items = board.items;
          if (!items.length) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };
          const idx = Math.max(0, items.findIndex((t) => t.id === board.activeTaskId));
          const delta = intent.type === 'TASK_DECK_NEXT' ? 1 : -1;
          const nextIdx = (idx + delta + items.length) % items.length;
          const nextId = items[nextIdx]?.id ?? items[0]!.id;
          const nextItem = items[nextIdx];

          // 异步加载关联文档
          if (nextItem && nextItem.linkedRefs.length > 0) {
            void (async () => {
              const linkedDocs = await loadLinkedDocs(file.path, nextItem.linkedRefs);
              set((state) => {
                const currentBoard = state.vm.content.taskBoard;
                if (!currentBoard || currentBoard.activeTaskId !== nextId) return { vm: state.vm };
                return {
                  vm: {
                    ...state.vm,
                    content: {
                      ...state.vm.content,
                      taskBoard: { ...currentBoard, linkedDocs, linkedDocsLoading: false, linkedDocsError: null }
                    }
                  }
                };
              });
            })();
          }

          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                taskBoard: {
                  ...board,
                  activeTaskId: nextId,
                  deckMode: 'single',
                  detail: EMPTY_TASK_DETAIL,
                  linkedDocs: [],
                  linkedDocsLoading: nextItem?.linkedRefs.length ? true : false,
                  linkedDocsError: null
                }
              }
            }
          };
        }
        case 'TASK_DECK_FOCUS': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const text = effectiveContentText(vm.content);
          const board = vm.content.taskBoard ?? parseTaskBoardV2(text, null);
          const targetItem = board.items.find((t) => t.id === intent.taskId);
          if (!targetItem) return { vm: { ...vm, content: { ...vm.content, taskBoard: board } } };

          // 异步加载关联文档
          if (targetItem.linkedRefs.length > 0) {
            void (async () => {
              const linkedDocs = await loadLinkedDocs(file.path, targetItem.linkedRefs);
              set((state) => {
                const currentBoard = state.vm.content.taskBoard;
                if (!currentBoard || currentBoard.activeTaskId !== intent.taskId) return { vm: state.vm };
                return {
                  vm: {
                    ...state.vm,
                    content: {
                      ...state.vm.content,
                      taskBoard: { ...currentBoard, linkedDocs, linkedDocsLoading: false, linkedDocsError: null }
                    }
                  }
                };
              });
            })();
          }

          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                taskBoard: {
                  ...board,
                  activeTaskId: intent.taskId,
                  deckMode: 'single',
                  detail: EMPTY_TASK_DETAIL,
                  linkedDocs: [],
                  linkedDocsLoading: targetItem.linkedRefs.length > 0,
                  linkedDocsError: null
                }
              }
            }
          };
        }
        case 'TASK_LINKED_DOC_JUMP': {
          // 跳转到关联文档：打开对应的需求文件并设置搜索查询以高亮定位
          const file = vm.content.file;
          if (!file) return { vm };

          // 从当前任务文件路径推导需求文件路径
          const dirPath = file.path.replace(/[/\\][^/\\]+$/, '');
          const targetPath = `${dirPath}/${intent.sourceFile}`;

          // 触发打开文件并设置搜索查询
          void (async () => {
            const api = window.specwave;
            if (!api) return;

            // 读取目标文件
            const res = await api.readTextFile(targetPath);
            if (!res.ok) return;

            // 计算匹配位置
            const hits = findMatchStarts(res.text, intent.refId);

            set((state) => {
              const vm2 = state.vm;
              return {
                vm: {
                  ...vm2,
                  centerVisible: true,
                  explorer: { ...vm2.explorer, selectedPath: targetPath },
                  content: {
                    find: { isOpen: true, query: intent.refId, matchStarts: hits, activeIndex: 0 },
                    file: { path: targetPath, name: intent.sourceFile, kind: 'markdown', sha256: res.sha256 },
                    text: res.text,
                    draftText: res.text,
                    mode: 'view',
                    isDirty: false,
                    saveStatus: 'idle',
                    saveError: null,
                    taskBoard: null
                  }
                }
              };
            });
          })();

          return { vm };
        }
        case 'TASK_LINKED_DOCS_TOGGLE_SECTION': {
          // 折叠/展开关联文档区域（暂时不实现，保持默认展开）
          return { vm };
        }
        case 'TASK_DETAIL_MODE_SET': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const board = vm.content.taskBoard;
          if (!board?.activeTaskId) return { vm };
          const text = effectiveContentText(vm.content);
          const item = board.items.find((t) => t.id === board.activeTaskId);
          if (!item) return { vm };
          const { title, body } = extractTaskDrafts(text, item);
          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                taskBoard: {
                  ...board,
                  detail: { isOpen: true, mode: intent.mode, draftTitle: title, draftBody: body }
                }
              }
            }
          };
        }
        case 'TASK_DETAIL_DRAFT_SET': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const board = vm.content.taskBoard;
          if (!board?.detail.isOpen) return { vm };
          const nextTitle = intent.title ?? board.detail.draftTitle;
          const nextBody = intent.body ?? board.detail.draftBody;
          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                taskBoard: { ...board, detail: { ...board.detail, draftTitle: nextTitle, draftBody: nextBody } }
              }
            }
          };
        }
        case 'TASK_DETAIL_SAVE': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const board = vm.content.taskBoard;
          if (!board?.activeTaskId || !board.detail.isOpen) return { vm };

          const effectiveText = effectiveContentText(vm.content);
          const item = board.items.find((t) => t.id === board.activeTaskId);
          if (!item) return { vm };

          const blockText = effectiveText.slice(item.source.blockStartPos, item.source.blockEndPos);
          const trimmed = blockText.trimEnd();
          const tail = blockText.slice(trimmed.length);

          const statusChar = item.checked ? 'x' : ' ';
          const beforeStatus = effectiveText.slice(item.source.blockStartPos, item.source.statusPos);
          const afterStatus = effectiveText.slice(item.source.statusPos + 1, item.source.titleStartPos);
          const nextTitle = board.detail.draftTitle.trim();
          const headerLine = `${beforeStatus}${statusChar}${afterStatus}${nextTitle}`;

          const newline = detectNewline(effectiveText);
          const nextBody = normalizeNewlines(board.detail.draftBody, newline).trimEnd();

          let nextBlock = headerLine;
          if (nextBody) nextBlock += `${newline}${nextBody}`;
          nextBlock += tail;

          const nextText =
            effectiveText.slice(0, item.source.blockStartPos) + nextBlock + effectiveText.slice(item.source.blockEndPos);

          const optimisticPrev: TaskBoardVM = { ...board, detail: { ...board.detail, mode: 'view' } };
          const optimisticBoard = parseTaskBoardV2(nextText, optimisticPrev);

          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const current = get().vm.content.file;
            if (!current || current.path !== file.path) return;
            const res = await api.saveTextFile(current.path, nextText, current.sha256);
            if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());

            set((state) => {
              const vm2 = state.vm;
              if (!vm2.content.file || vm2.content.file.path !== file.path) return { vm: vm2 };

              if (!res.ok) {
                if ('conflict' in res && res.conflict) {
                  return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
                }
                return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
              }

              return {
                vm: {
                  ...vm2,
                  content: {
                    ...vm2.content,
                    text: nextText,
                    draftText: nextText,
                    isDirty: false,
                    saveStatus: 'saved',
                    saveError: null,
                    file: { ...vm2.content.file!, sha256: res.sha256 },
                    taskBoard: parseTaskBoardV2(nextText, vm2.content.taskBoard)
                  }
                }
              };
            });
          })();

          return {
            vm: {
              ...vm,
              content: {
                ...vm.content,
                draftText: nextText,
                isDirty: true,
                saveStatus: 'saving',
                saveError: null,
                taskBoard: optimisticBoard
              }
            }
          };
        }
        case 'TASK_ITEM_START': {
          const file = vm.content.file;
          if (!file || file.kind !== 'task') return { vm };
          const board = vm.content.taskBoard;
          if (!board) return { vm };
          const item = board.items.find((t) => t.id === intent.taskId);
          if (!item) return { vm };

          const effectiveText = effectiveContentText(vm.content);
          const rawBlock = effectiveText.slice(item.source.blockStartPos, item.source.blockEndPos).trimEnd();
          const lines = rawBlock.replaceAll('\r\n', '\n').split('\n');
          const template = [
            `# 开始：${item.title.trim()}`,
            `# 来源：${file.name}`,
            '# 任务内容：',
            ...lines.map((l) => `# ${l}`),
            '#'
          ].join('\r\n');

          const ensurePanel = () => {
            const active = vm.terminal.activePanelId;
            if (active && vm.terminal.panelIds.includes(active)) return active;
            const fallback = vm.terminal.panelIds[0];
            if (fallback) return fallback;
            return '';
          };

          const existingId = ensurePanel();
          if (existingId) {
            void (async () => {
              const api = window.specwave;
              if (!api?.terminalWrite) return;
              api.terminalWrite(existingId, template);
            })();

            return {
              vm: {
                ...vm,
                rightVisible: true,
                rightMode: 'terminal' as const,
                terminal: { ...vm.terminal, activePanelId: existingId }
              }
            };
          }

          const nextId = `terminal-${Date.now()}`;
          terminalUserTyped.delete(nextId);
          const cwd = vm.explorer.projectRoot ?? null;

          void (async () => {
            const api = window.specwave;
            if (!api?.terminalCreateSession) return;
            const res = await api.terminalCreateSession({ id: nextId, cwd });
            if (!res.ok) {
              set((state) => {
                const vm2 = state.vm;
                const prev = vm2.terminal.outputByPanel[nextId] ?? [];
                const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
                return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: { ...vm2.terminal.outputByPanel, [nextId]: next } } } };
              });
              return;
            }
            try {
              api.terminalWrite?.(nextId, template);
            } catch {}
          })();

          return {
            vm: {
              ...vm,
              rightVisible: true,
              rightMode: 'terminal' as const,
              terminal: {
                panelIds: [...vm.terminal.panelIds, nextId],
                activePanelId: nextId,
                outputByPanel: { ...vm.terminal.outputByPanel, [nextId]: ['正在启动终端…\r\n'] }
              }
            }
          };
        }
        case 'THEME_TOGGLE': {
          const nextTheme: AppViewModel['ui']['theme'] = vm.ui.theme === 'dark' ? 'light' : 'dark';
          try {
            window.localStorage.setItem('specwave_theme', nextTheme);
          } catch {}
          return { vm: { ...vm, ui: { ...vm.ui, theme: nextTheme } } };
        }
        case 'SKIN_CYCLE': {
          const skins: AppViewModel['ui']['skin'][] = ['blue', 'purple', 'green', 'amber'];
          const idx = skins.indexOf(vm.ui.skin);
          const nextSkin = skins[(idx < 0 ? 0 : idx + 1) % skins.length] ?? 'blue';
          try {
            window.localStorage.setItem('specwave_skin', nextSkin);
          } catch {}
          return { vm: { ...vm, ui: { ...vm.ui, skin: nextSkin } } };
        }
        case 'TERMINAL_PANEL_CLOSE': {
          void (async () => {
            const api = window.specwave;
            if (!api?.terminalKillSession) return;
            await api.terminalKillSession(intent.id);
          })();

          terminalUserTyped.delete(intent.id);
          const nextIds = vm.terminal.panelIds.filter((id) => id !== intent.id);
          const nextActive = vm.terminal.activePanelId === intent.id ? (nextIds[0] ?? '') : vm.terminal.activePanelId;
          const nextOutput = { ...vm.terminal.outputByPanel };
          delete nextOutput[intent.id];
          return {
            vm: {
              ...vm,
              terminal: { ...vm.terminal, panelIds: nextIds, activePanelId: nextActive, outputByPanel: nextOutput }
            }
          };
        }
        case 'TERMINAL_PANEL_SET_ACTIVE':
          return { vm: { ...vm, terminal: { ...vm.terminal, activePanelId: intent.id }, rightVisible: true } };
        case 'CHAT_SESSION_CLOSE': {
          const nextIds = vm.chat.sessionIds.filter((id) => id !== intent.id);
          const nextActive = vm.chat.activeSessionId === intent.id ? (nextIds[0] ?? '') : vm.chat.activeSessionId;
          const nextMessages = { ...vm.chat.messagesBySession };
          const nextDraft = { ...vm.chat.draftBySession };
          delete nextMessages[intent.id];
          delete nextDraft[intent.id];
          return {
            vm: {
              ...vm,
              chat: {
                ...vm.chat,
                sessionIds: nextIds,
                activeSessionId: nextActive,
                messagesBySession: nextMessages,
                draftBySession: nextDraft
              }
            }
          };
        }
        case 'CHAT_SESSION_SET_ACTIVE':
          return { vm: { ...vm, chat: { ...vm.chat, activeSessionId: intent.id } } };
        case 'CHAT_DRAFT_SET':
          return {
            vm: {
              ...vm,
              chat: {
                ...vm.chat,
                draftBySession: { ...vm.chat.draftBySession, [intent.id]: intent.text }
              }
            }
          };
        case 'CHAT_MESSAGE_SUBMIT': {
          const existing = vm.chat.messagesBySession[intent.id] ?? [];
          const nextMessages = [
            ...existing,
            msg('你', intent.text),
            msg('AI', '已收到（示意）：后续这里会接入 Codex CLI 流式输出与取消。')
          ];
          return {
            vm: {
              ...vm,
              chat: {
                ...vm.chat,
                activeSessionId: intent.id,
                messagesBySession: { ...vm.chat.messagesBySession, [intent.id]: nextMessages },
                draftBySession: { ...vm.chat.draftBySession, [intent.id]: '' }
              }
            }
          };
        }
        case 'TERMINAL_WRITE': {
          const api = window.specwave;
          if (!api?.terminalWrite) return { vm };
          terminalUserTyped.add(intent.id);
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
            if (!api?.clipboardReadText || !api?.terminalWrite) return;
            try {
              const text = api.clipboardReadText();
              if (!text) return;
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
        case 'RIGHT_PANEL_ADD': {
          if (vm.rightMode === 'terminal') {
            const nextId = `terminal-${Date.now()}`;
            terminalUserTyped.delete(nextId);

            void (async () => {
              const api = window.specwave;
              if (!api?.terminalCreateSession) return;
              const cwd = get().vm.explorer.projectRoot ?? null;
              const res = await api.terminalCreateSession({ id: nextId, cwd });
              if (res.ok) return;
              set((state) => {
                const vm2 = state.vm;
                const prev = vm2.terminal.outputByPanel[nextId] ?? [];
                const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
                return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: { ...vm2.terminal.outputByPanel, [nextId]: next } } } };
              });
            })();

            return {
              vm: {
                ...vm,
                terminal: {
                  panelIds: [...vm.terminal.panelIds, nextId],
                  activePanelId: nextId,
                  outputByPanel: { ...vm.terminal.outputByPanel, [nextId]: ['正在启动终端…\r\n'] }
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
        case 'LAYOUT_CONTAINER_SET': {
          // 响应式策略：窗口变窄时不挤压三栏宽度，改用底部横向滚动条承载。
          // 现在改为“各区域内部滚动条承载内容最小宽度”，因此这里：
          // - 缩小窗口：只更新容器宽度（避免抖动）
          // - 放大窗口：让 centerPx 同步到当前可用宽度基准，保证拖拽阈值不失真
          const prev = vm.layout.containerWidthPx;
          const nextPanelMinW = { ...vm.panelMinW, centerPx: Math.max(320, Math.round(intent.widthPx * 0.7)) };
          if (intent.widthPx <= prev) {
            return { vm: { ...vm, panelMinW: nextPanelMinW, layout: { ...vm.layout, containerWidthPx: intent.widthPx } } };
          }

          const splitters = splitterCountFlags(vm) * SPLITTER_PX;
          const available = Math.max(0, intent.widthPx - splitters);
          const left = vm.leftVisible ? clamp(vm.layout.leftPx, MIN_LEFT_PX, MAX_LEFT_PX) : 0;
          const right = vm.rightVisible ? Math.max(MIN_RIGHT_PX, vm.layout.rightPx) : 0;
          const remainder = Math.max(MIN_CENTER_PX, available - left - right);

          return {
            vm: {
              ...vm,
              panelMinW: nextPanelMinW,
              layout: { ...vm.layout, containerWidthPx: intent.widthPx, centerPx: remainder }
            }
          };
        }
        case 'LAYOUT_DRAG_START': {
          const snap: DragSnapshot = {
            handle: intent.handle,
            leftVisible: vm.leftVisible,
            centerVisible: vm.centerVisible,
            rightVisible: vm.rightVisible,
            leftPx: vm.layout.leftPx,
            centerPx: vm.layout.centerPx,
            rightPx: vm.layout.rightPx,
            containerWidthPx: vm.layout.containerWidthPx
          };
          return { vm: { ...vm, layout: { ...vm.layout, isDragging: true } }, drag: snap };
        }
        case 'LAYOUT_DRAG_MOVE': {
          if (!drag) return { vm };
          const next = applyDrag(drag, intent.deltaX);
          const nextVm = {
            ...vm,
            leftVisible: next.leftVisible,
            centerVisible: next.centerVisible,
            rightVisible: next.rightVisible,
            layout: { ...vm.layout, leftPx: next.leftPx, centerPx: next.centerPx, rightPx: next.rightPx }
          };
          return { vm: nextVm };
        }
        case 'LAYOUT_DRAG_END': {
          const normalized = normalizeLayoutStable(vm);
          return {
            vm: { ...vm, layout: { ...vm.layout, isDragging: false, ...normalized } },
            drag: null
          };
        }
        case 'SHORTCUT_SAVE':
          if (!vm.content.file || !vm.content.isDirty) return { vm };
          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const current = get().vm.content.file;
            if (!current) return;
            const text = get().vm.content.draftText;
            const res = await api.saveTextFile(current.path, text, current.sha256);
            if (res.ok) selfWriteAtByPath.set(normalizeFsPath(current.path), Date.now());
            set((state) => {
              const vm2 = state.vm;
              if (!vm2.content.file || vm2.content.file.path !== current.path) return { vm: vm2 };

              if (!res.ok) {
                if ('conflict' in res && res.conflict) {
                  return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'conflict', saveError: res.error } } };
                }
                return { vm: { ...vm2, content: { ...vm2.content, saveStatus: 'error', saveError: res.error } } };
              }

              const kind = vm2.content.file.kind;
              const nextText = vm2.content.draftText;
              return {
                vm: {
                  ...vm2,
                  content: {
                    ...vm2.content,
                    text: nextText,
                    isDirty: false,
                    saveStatus: 'saved',
                    saveError: null,
                    file: { ...vm2.content.file, sha256: res.sha256 },
                    taskBoard: kind === 'task' ? parseTaskBoardV2(nextText, vm2.content.taskBoard) : vm2.content.taskBoard
                  }
                }
              };
            });
          })();
          return { vm: { ...vm, content: { ...vm.content, saveStatus: 'saving', saveError: null } } };
        case 'SHORTCUT_FIND': {
          const file = vm.content.file;
          if (!file) return { vm };
          const text = effectiveContentText(vm.content);
          const hits = findMatchStarts(text, vm.content.find.query);
          const nextActive = hits.length ? Math.min(vm.content.find.activeIndex, hits.length - 1) : 0;
          return {
            vm: {
              ...vm,
              centerVisible: true,
              content: {
                ...vm.content,
                find: { ...vm.content.find, isOpen: true, matchStarts: hits, activeIndex: nextActive }
              }
            }
          };
        }
        default:
          return { vm };
      }
    });
  }
}));

void (async () => {
  const api = window.specwave;
  if (!api?.getRecentProjects) return;
  const recentProjects = await api.getRecentProjects();
  useAppStore.setState((state) => ({
    vm: {
      ...state.vm,
      app: { ...state.vm.app, recentProjects }
    }
  }));
})();

let terminalBridgeSubscribed = false;
void (async () => {
  const api = window.specwave;
  if (!api?.onTerminalEvent) return;
  if (terminalBridgeSubscribed) return;
  terminalBridgeSubscribed = true;

  const pending: Record<string, string[]> = {};
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    useAppStore.setState((state) => {
      const vm = state.vm;
      let nextOutputByPanel = vm.terminal.outputByPanel;

      for (const id of ids) {
        const chunks = pending[id];
        if (!chunks || chunks.length === 0) continue;
        delete pending[id];

        const prevRaw = nextOutputByPanel[id] ?? [];
        const prev = prevRaw.length === 1 && prevRaw[0]?.startsWith('正在启动终端…') ? [] : prevRaw;
        const merged = [...prev, ...chunks].slice(-MAX_TERMINAL_CHUNKS);
        nextOutputByPanel = { ...nextOutputByPanel, [id]: merged };
      }

      return {
        vm: {
          ...vm,
          terminal: {
            ...vm.terminal,
            outputByPanel: nextOutputByPanel
          }
        }
      };
    });
  };

  const scheduleFlush = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  };

  api.onTerminalEvent((evt) => {
    switch (evt.type) {
      case 'data': {
        (pending[evt.id] ||= []).push(evt.data);
        scheduleFlush();
        return;
      }
      case 'exit': {
        const tail = `\r\n[进程已退出] exitCode=${evt.exitCode}${evt.signal ? ` signal=${evt.signal}` : ''}\r\n`;
        (pending[evt.id] ||= []).push(tail);
        scheduleFlush();
        return;
      }
      case 'error': {
        (pending[evt.id] ||= []).push(`\r\n[终端错误] ${evt.error}\r\n`);
        scheduleFlush();
        return;
      }
    }
  });

  if (specwaveWindowKind === 'main' && api.terminalCreateSession) {
    const id = useAppStore.getState().vm.terminal.activePanelId;
    const cwd = bootProjectPath ?? useAppStore.getState().vm.explorer.projectRoot ?? null;
    const res = await api.terminalCreateSession({ id, cwd });
    if (!res.ok) {
      useAppStore.setState((state) => {
        const vm = state.vm;
        const prev = vm.terminal.outputByPanel[id] ?? [];
        const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
        return { vm: { ...vm, terminal: { ...vm.terminal, outputByPanel: { ...vm.terminal.outputByPanel, [id]: next } } } };
      });
    }
  }
})();

let fsBridgeSubscribed = false;
void (async () => {
  const api = window.specwave;
  if (!api?.onFsEvent) return;
  if (fsBridgeSubscribed) return;
  fsBridgeSubscribed = true;

  const pending: { workspace: Set<string>; project: Set<string> } = {
    workspace: new Set(),
    project: new Set()
  };
  let scheduled = false;
  let flushing = false;

  const applyDirectoryRefresh = (tree: 'workspace' | 'project', dirPath: string, res: { ok: true; entries: { name: string; path: string; kind: 'dir' | 'file' }[] } | { ok: false; error: string }) => {
    useAppStore.setState((state) => {
      const vm = state.vm;
      const root = tree === 'workspace' ? vm.explorer.workspaceRoot : vm.explorer.projectRoot;
      if (!root) return { vm };

      const isRoot = normalizeFsPath(dirPath) === normalizeFsPath(root);
      const nextNodesRaw = res.ok ? toExplorerNodes(res.entries) : null;

      if (isRoot) {
        const prevRootNodes = tree === 'workspace' ? vm.explorer.workspace : vm.explorer.project;
        if (!res.ok) {
          // 关键处理节点：外部修改文件时，readDirectory 可能短暂失败（例如编辑器写入/锁定窗口期）。
          // 这里不能用空数组覆盖根节点，否则会表现为“左侧树清空/闪烁/像被重置”。保留旧数据并记录错误即可。
          return { vm: { ...vm, explorer: { ...vm.explorer, error: res.error } } };
        }
        const merged = mergeExplorerChildren(prevRootNodes, nextNodesRaw ?? []);
        return { vm: { ...vm, explorer: { ...vm.explorer, [tree]: merged, error: null } } };
      }

      const treeNodes = tree === 'workspace' ? vm.explorer.workspace : vm.explorer.project;
      const hit = findNodeById(treeNodes, dirPath);
      if (!hit || hit.kind !== 'dir') return { vm };

      const nextTree = updateNodeById(treeNodes, dirPath, (node) => ({
        ...node,
        children: res.ok ? mergeExplorerChildren(hit.children, nextNodesRaw ?? []) : hit.children,
        isLoading: false,
        error: res.ok ? undefined : res.error
      }));
      return { vm: { ...vm, explorer: { ...vm.explorer, [tree]: nextTree } } };
    });
  };

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const api2 = window.specwave;
      if (!api2) return;

      while (pending.workspace.size || pending.project.size) {
        const batch: { tree: 'workspace' | 'project'; dirPath: string }[] = [];

        for (const p of pending.workspace) {
          batch.push({ tree: 'workspace', dirPath: p });
          pending.workspace.delete(p);
          if (batch.length >= 6) break;
        }
        for (const p of pending.project) {
          batch.push({ tree: 'project', dirPath: p });
          pending.project.delete(p);
          if (batch.length >= 6) break;
        }

        if (!batch.length) break;

        const results = await Promise.all(
          batch.map(async (t) => ({ ...t, res: await api2.readDirectory(t.dirPath) }))
        );

        for (const r of results) applyDirectoryRefresh(r.tree, r.dirPath, r.res);
      }
    } finally {
      flushing = false;
    }
  };

  const scheduleFlush = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      void flush();
    }, 200);
  };

  const enqueueRefresh = (tree: 'workspace' | 'project', dirPath: string) => {
    pending[tree].add(dirPath);
    scheduleFlush();
  };

  const resolveExpandedDirId = (tree: 'workspace' | 'project', dirPath: string) => {
    const expanded = useAppStore.getState().vm.explorer.expanded[tree];
    const target = normalizeFsPath(dirPath);
    for (const id of expanded) {
      if (normalizeFsPath(id) === target) return id;
    }
    return null;
  };

  const reloadOpenFile = async (filePath: string, mode: 'auto' | 'force') => {
    const api2 = window.specwave;
    if (!api2) return;

    const current = useAppStore.getState().vm.content.file;
    if (!current || normalizeFsPath(current.path) !== normalizeFsPath(filePath)) return;

    const stateNow = useAppStore.getState().vm.content;
    const isDirty = stateNow.isDirty;

    if (isDirty && mode === 'auto') {
      if (suppressExternalChangePromptPath && normalizeFsPath(suppressExternalChangePromptPath) === normalizeFsPath(filePath)) {
        return;
      }

      const title = '文件已在外部修改';
      const message = `检测到文件已在外部修改：\n${basename(filePath)}\n\n你当前有未保存的修改。是否用磁盘版本覆盖当前内容？`;
      const detail = '覆盖：丢弃未保存改动；保留：继续保留当前内容（保存时可能提示冲突）。';

      const response = (() => {
        if (!api2.showMessageBox) {
          const ok = window.confirm(`${message}\n\n${detail}`);
          return ok ? 0 : 1;
        }
        return null;
      })();

      const chosen = response != null ? response : (await api2.showMessageBox({ title, message, detail, buttons: ['覆盖', '保留'], defaultId: 1, cancelId: 1 }));
      const idx = typeof chosen === 'number' ? chosen : chosen.ok ? chosen.response : 1;

      if (idx !== 0) {
        suppressExternalChangePromptPath = filePath;
        useAppStore.setState((s) => ({
          vm: {
            ...s.vm,
            content: {
              ...s.vm.content,
              saveStatus: s.vm.content.isDirty ? 'conflict' : s.vm.content.saveStatus,
              saveError: s.vm.content.isDirty ? '文件已在外部修改（已选择保留当前内容）；保存时可能冲突。' : s.vm.content.saveError
            }
          }
        }));
        return;
      }
    }

    suppressExternalChangePromptPath = null;

    const kind = detectContentKind(filePath);
    if (kind === 'binary') {
      useAppStore.setState((state) => {
        const vm = state.vm;
        const file = vm.content.file;
        if (!file || normalizeFsPath(file.path) !== normalizeFsPath(filePath)) return { vm };
        return {
          vm: {
            ...vm,
            content: {
              ...vm.content,
              find: { ...initialVm.content.find },
              file: { ...file, kind, sha256: '' },
              text: '',
              draftText: '',
              mode: 'view',
              isDirty: false,
              saveStatus: 'idle',
              saveError: null,
              taskBoard: null
            }
          }
        };
      });
      return;
    }
    const res = await (async () => {
      if (kind !== 'image') return api2.readTextFile(filePath);
      if (!api2.readBinaryFile) return { ok: false, error: '当前桌面端版本不支持图片预览。' } as const;
      const bin = await api2.readBinaryFile(filePath);
      if (!bin.ok) return { ok: false, error: bin.error } as const;
      return { ok: true, text: `data:${bin.mime};base64,${bin.base64}`, sha256: bin.sha256 } as const;
    })();

    useAppStore.setState((state) => {
      const vm = state.vm;
      const file = vm.content.file;
      if (!file || normalizeFsPath(file.path) !== normalizeFsPath(filePath)) return { vm };

      if (!res.ok) {
        return { vm: { ...vm, content: { ...vm.content, saveStatus: 'error', saveError: res.error } } };
      }

      const nextMode = vm.content.mode;
      const nextFind = vm.content.find.isOpen && kind !== 'image'
        ? { ...vm.content.find, matchStarts: findMatchStarts(res.text, vm.content.find.query), activeIndex: 0 }
        : { ...initialVm.content.find };
      return {
        vm: {
          ...vm,
          content: {
            ...vm.content,
            file: { ...file, kind, sha256: res.sha256 },
            text: res.text,
            draftText: res.text,
            mode: nextMode,
            isDirty: false,
            saveStatus: 'idle',
            saveError: null,
            taskBoard: kind === 'task' ? parseTaskBoardV2(res.text, vm.content.taskBoard) : kind === 'image' ? null : vm.content.taskBoard,
            find: nextFind
          }
        }
      };
    });
  };

  api.onFsEvent((evt) => {
    const now = Date.now();
    const vm = useAppStore.getState().vm;
    const path0 = evt.path;

    const lastSelfWriteAt = selfWriteAtByPath.get(normalizeFsPath(path0));
    if (lastSelfWriteAt != null && now - lastSelfWriteAt < SELF_WRITE_SILENCE_MS) return;

    const currentFilePath = vm.content.file?.path ?? null;
    if (currentFilePath && normalizeFsPath(currentFilePath) === normalizeFsPath(path0)) {
      void reloadOpenFile(currentFilePath, 'auto');
    }

    if (evt.event !== 'rename') return;

    const workspaceRoot = vm.explorer.workspaceRoot;
    const projectRoot = vm.explorer.projectRoot;

    if (workspaceRoot && isWithinRoot(path0, workspaceRoot)) {
      const dirCandidate = dirname(path0);
      const resolved = normalizeFsPath(dirCandidate) === normalizeFsPath(workspaceRoot)
        ? workspaceRoot
        : resolveExpandedDirId('workspace', dirCandidate);
      if (resolved) enqueueRefresh('workspace', resolved);
      return;
    }

    if (projectRoot && isWithinRoot(path0, projectRoot)) {
      const dirCandidate = dirname(path0);
      const resolved = normalizeFsPath(dirCandidate) === normalizeFsPath(projectRoot)
        ? projectRoot
        : resolveExpandedDirId('project', dirCandidate);
      if (resolved) enqueueRefresh('project', resolved);
    }
  });
})();

let uiSessionSubscribed = false;
void (() => {
  if (typeof window === 'undefined') return;
  if (specwaveWindowKind !== 'main') return;
  if (uiSessionSubscribed) return;
  uiSessionSubscribed = true;

  let scheduled = false;
  let pending: UiSessionSnapshot | null = null;

  const flush = () => {
    scheduled = false;
    if (!pending) return;
    persistUiSession(pending);
    pending = null;
  };

  const schedule = (snap: UiSessionSnapshot) => {
    pending = snap;
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(flush, 120);
  };

  let prevKey = '';
  useAppStore.subscribe((state) => {
    const vm = state.vm;
    const snap: UiSessionSnapshot = {
      leftVisible: vm.leftVisible,
      centerVisible: vm.centerVisible,
      rightVisible: vm.rightVisible,
      rightMode: vm.rightMode,
      explorerExpanded: vm.explorer.expanded,
      explorerSelectedPath: vm.explorer.selectedPath,
      lastOpenFilePath: vm.content.file?.path ?? vm.explorer.selectedPath ?? null,
      projectRoot: vm.explorer.projectRoot,
      workspaceRoot: vm.explorer.workspaceRoot
    };
    const key = JSON.stringify(snap);
    if (key === prevKey) return;
    prevKey = key;
    schedule(snap);
  });

  // 关键处理节点：整页刷新前可能来不及走节流（例如 Vite full reload），这里在卸载前再强制落一次。
  window.addEventListener('beforeunload', () => {
    try {
      const vm = useAppStore.getState().vm;
      persistUiSession({
        leftVisible: vm.leftVisible,
        centerVisible: vm.centerVisible,
        rightVisible: vm.rightVisible,
        rightMode: vm.rightMode,
        explorerExpanded: vm.explorer.expanded,
        explorerSelectedPath: vm.explorer.selectedPath,
        lastOpenFilePath: vm.content.file?.path ?? vm.explorer.selectedPath ?? null,
        projectRoot: vm.explorer.projectRoot,
        workspaceRoot: vm.explorer.workspaceRoot
      });
    } catch {}
  });
})();

if (specwaveWindowKind === 'main') {
  // 优先恢复 sessionStorage 里记住的项目页签；没有历史才用 bootProjectPath 打开初始项目。
  if (restoredProjectsSession?.activeTabId) {
    useAppStore.getState().dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: restoredProjectsSession.activeTabId });
  } else if (!restoredProjectsSession && bootProjectPath) {
    useAppStore.getState().dispatch({ type: 'PROJECT_OPEN_RECENT', path: bootProjectPath });
  }

  // 关键处理节点：开发模式下外部文件变动可能触发整页刷新（HMR full-reload），导致“看起来被重置/文件都关了”。
  // 这里用 sessionStorage 记住最后打开的文件路径，并在启动后自动恢复一次，尽量让刷新变得“无感”。
  const lastOpen = restoredUiSession?.lastOpenFilePath ?? restoredUiSession?.explorerSelectedPath ?? null;
  const lastOpenProjectRoot = restoredUiSession?.projectRoot ?? null;
  const lastOpenWorkspaceRoot = restoredUiSession?.workspaceRoot ?? null;
  if (lastOpen) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const vm = useAppStore.getState().vm;
      if (vm.content.file?.path === lastOpen) {
        window.clearInterval(timer);
        return;
      }
      // 等项目根就绪后再恢复，避免被后续“打开项目/切页签”把 content 重置掉。
      if (!vm.explorer.projectRoot && !vm.explorer.workspaceRoot) {
        if (attempts > 40) window.clearInterval(timer);
        return;
      }
      const rootsMatch = (() => {
        if (lastOpenProjectRoot && vm.explorer.projectRoot && normalizeFsPath(lastOpenProjectRoot) !== normalizeFsPath(vm.explorer.projectRoot)) return false;
        if (lastOpenWorkspaceRoot && vm.explorer.workspaceRoot && normalizeFsPath(lastOpenWorkspaceRoot) !== normalizeFsPath(vm.explorer.workspaceRoot)) return false;
        return true;
      })();
      if (!rootsMatch) {
        window.clearInterval(timer);
        return;
      }
      const withinAnyRoot =
        (vm.explorer.projectRoot && isWithinRoot(lastOpen, vm.explorer.projectRoot)) ||
        (vm.explorer.workspaceRoot && isWithinRoot(lastOpen, vm.explorer.workspaceRoot));
      if (!withinAnyRoot) {
        window.clearInterval(timer);
        return;
      }
      try {
        // 先检查文件是否存在，不存在则清除记忆并跳过
        void (async () => {
          const api = window.specwave;
          if (!api) return;
          const exists = await api.readTextFile(lastOpen);
          if (!exists.ok) {
            // 文件不存在，清除 sessionStorage 中的记忆
            try {
              const raw = sessionStorage.getItem(UI_SESSION_KEY);
              if (raw) {
                const parsed = JSON.parse(raw);
                delete parsed.lastOpenFilePath;
                delete parsed.explorerSelectedPath;
                sessionStorage.setItem(UI_SESSION_KEY, JSON.stringify(parsed));
              }
            } catch {}
            window.clearInterval(timer);
            return;
          }
          useAppStore.getState().dispatch({ type: 'EXPLORER_OPEN_FILE', path: lastOpen });
        })();
      } catch {}
      if (attempts > 40) window.clearInterval(timer);
    }, 150);
  }
}
