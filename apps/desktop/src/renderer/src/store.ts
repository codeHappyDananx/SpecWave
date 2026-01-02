import { create } from 'zustand';
import type {
  AppViewModel,
  ChatMessageVM,
  ContentKind,
  ContentMode,
  ExplorerNodeVM,
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

const initialTerminalLines = [
  'PS C:> pnpm dev',
  'VITE ready',
  'Local: http://localhost:5173',
  '✔ Electron main started',
  '✔ Renderer connected'
];

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

const specwaveWindowKind = getSpecwaveWindowKind();
const bootProjectPath = getBootProjectPath();

const initialVm: AppViewModel = {
  app: { mode: specwaveWindowKind === 'welcome' ? 'welcome' : 'main', recentProjects: [] },
  projects: { openTabs: [], activeTabId: null },
  explorer: {
    workspaceRoot: null,
    projectRoot: null,
    workspace: [],
    project: [],
    expanded: { workspace: [], project: [] },
    selectedPath: null,
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
    taskBoard: null
  },
  leftVisible: true,
  centerVisible: true,
  rightVisible: true,
  rightMode: 'terminal',
  globalSearchQuery: '',
  terminal: {
    activePanelId: 'terminal-1',
    panelIds: ['terminal-1'],
    outputByPanel: { 'terminal-1': initialTerminalLines }
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
  ui: { theme: 'light' },
  layout: { containerWidthPx: 1280, isDragging: false, leftPx: 280, centerPx: 640, rightPx: 360 }
};

const SPLITTER_PX = 8;
const MIN_LEFT_PX = 240;
// 左区最大宽度不使用固定值：拖拽时需要按窗口宽度动态放开，否则最大化后无法继续挤压其它区域。
// 这里保留一个“展示默认”上限，主要用于非拖拽场景的 clamp（拖拽场景用动态上限）。
const MAX_LEFT_PX = 720;
const MIN_CENTER_PX = 320;
const MIN_RIGHT_PX = 320;

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

  if (!vm.leftVisible) leftPx = 0;
  if (!vm.centerVisible) centerPx = 0;
  if (!vm.rightVisible) rightPx = 0;

  if (vm.leftVisible) leftPx = clamp(leftPx, MIN_LEFT_PX, MAX_LEFT_PX);
  if (vm.centerVisible) centerPx = Math.max(MIN_CENTER_PX, centerPx);
  if (vm.rightVisible) rightPx = Math.max(MIN_RIGHT_PX, rightPx);
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

function toExplorerNodes(entries: { name: string; path: string; kind: 'dir' | 'file' }[]): ExplorerNodeVM[] {
  return entries.map((e) => ({ id: e.path, name: e.name, kind: e.kind }));
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
  if (name === 'tasks.md' || name === 'work.md') return 'task';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
}

function defaultContentMode(kind: ContentKind): ContentMode {
  if (kind === 'task') return 'task' as const;
  if (kind === 'markdown') return 'view' as const;
  return 'editor' as const;
}

function parseTaskBoard(text: string): TaskBoardVM {
  const items: TaskItemVM[] = [];
  const re = /^(?<indent>[ \t]*)-\s*\[(?<status>[ xX])\]\s+(?<label>.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineStart = m.index;
    const fullLine = (m[0] ?? '').replace(/\r$/, '');
    const indent = m.groups?.indent ?? '';
    const status = (m.groups?.status ?? ' ').toLowerCase();
    const labelRaw = (m.groups?.label ?? '').replace(/\r$/, '');

    const bracketIdx = fullLine.indexOf('[');
    if (bracketIdx < 0) continue;
    const statusPos = lineStart + bracketIdx + 1;
    const level = Math.max(0, Math.floor(indent.length / 2));

    items.push({
      id: `task-${statusPos}`,
      label: labelRaw,
      checked: status === 'x',
      level,
      source: { statusPos }
    });
  }
  return { items };
}

function toggleCharAt(text: string, pos: number, nextChar: string) {
  if (pos < 0 || pos >= text.length) return text;
  return text.slice(0, pos) + nextChar + text.slice(pos + 1);
}

export const useAppStore = create<AppState>((set, get) => ({
  vm: initialVm,
  intentLog: [],
  drag: null,
  dispatch: (intent) => {
    set((state) => ({ intentLog: [`${new Date().toLocaleTimeString()} ${intent.type}`, ...state.intentLog].slice(0, 30) }));
    // 统一入口：先保证可观测，再逐步接入真实用例/副作用。
    console.log('[UIIntent]', intent);

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

             const projectName = basename(dirPath);
             const tabId = `proj-${Date.now()}`;
             const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

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

            const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : get().vm.app.recentProjects;
            if (seq !== openProjectSeq) return;

            set((state) => ({
              vm: {
                ...state.vm,
                app: { mode: 'main', recentProjects },
                projects: { openTabs: [{ id: tabId, folderName: projectName, path: dirPath }], activeTabId: tabId },
                explorer: {
                  workspaceRoot: workspaceRes.ok ? workspaceRoot : null,
                  projectRoot: dirPath,
                  workspace: workspaceNodes,
                  project: projectNodes,
                  expanded: { workspace: [], project: [] },
                  selectedPath: null,
                  isLoading: false,
                  error: workspaceError
                },
                content: {
                  file: null,
                  text: '',
                  draftText: '',
                  mode: 'view',
                  isDirty: false,
                  saveStatus: 'idle',
                  saveError: null,
                  taskBoard: null
                }
              }
            }));
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

             const projectName = basename(dirPath);
             const tabId = `proj-${Date.now()}`;
             const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

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

            const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : get().vm.app.recentProjects;
            if (seq !== openProjectSeq) return;

            set((state) => ({
              vm: {
                ...state.vm,
                app: { mode: 'main', recentProjects },
                projects: { openTabs: [{ id: tabId, folderName: projectName, path: dirPath }], activeTabId: tabId },
                explorer: {
                  workspaceRoot: workspaceRes.ok ? workspaceRoot : null,
                  projectRoot: dirPath,
                  workspace: workspaceNodes,
                  project: projectNodes,
                  expanded: { workspace: [], project: [] },
                  selectedPath: null,
                  isLoading: false,
                  error: workspaceError
                },
                content: {
                  file: null,
                  text: '',
                  draftText: '',
                  mode: 'view',
                  isDirty: false,
                  saveStatus: 'idle',
                  saveError: null,
                  taskBoard: null
                }
              }
            }));
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
        case 'PROJECT_TAB_SET_ACTIVE':
          return { vm: { ...vm, projects: { ...vm.projects, activeTabId: intent.id } } };
        case 'PROJECT_TAB_CLOSE': {
          const nextTabs = vm.projects.openTabs.filter((t) => t.id !== intent.id);
          const nextActive = vm.projects.activeTabId === intent.id ? (nextTabs[0]?.id ?? null) : vm.projects.activeTabId;
          const isEmpty = nextTabs.length === 0;
          if (!isEmpty) return { vm: { ...vm, projects: { openTabs: nextTabs, activeTabId: nextActive } } };
          return {
            vm: {
              ...vm,
              app: { ...vm.app, mode: 'welcome' },
              projects: { openTabs: [], activeTabId: null },
              explorer: { ...initialVm.explorer },
              content: { ...initialVm.content }
            }
          };
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

          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const res = await api.readTextFile(filePath);
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

              const kind = detectContentKind(filePath);
              const mode = defaultContentMode(kind);
              const taskBoard = kind === 'task' ? parseTaskBoard(res.text) : null;

              return {
                vm: {
                  ...vm2,
                  content: {
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
              content: { ...vm.content, saveStatus: 'idle', saveError: null }
            }
          };
        }
        case 'CONTENT_TOGGLE_VIEW_MODE': {
          const file = vm.content.file;
          if (!file) return { vm };
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

          const nextTaskBoard = file.kind === 'task' && nextMode === 'task' ? parseTaskBoard(effectiveText) : vm.content.taskBoard;
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
          return { vm: { ...vm, content: { ...vm.content, draftText: nextDraft, isDirty, saveStatus: 'idle', saveError: null } } };
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
                    taskBoard: kind === 'task' ? parseTaskBoard(nextText) : vm2.content.taskBoard
                  }
                }
              };
            });
          })();

          return { vm: { ...vm, content: { ...vm.content, saveStatus: 'saving', saveError: null } } };
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
                    taskBoard: parseTaskBoard(nextText)
                  }
                }
              };
            });
          })();

          return {
            vm: {
              ...vm,
              content: { ...vm.content, draftText: nextText, isDirty: true, saveStatus: 'saving', saveError: null, taskBoard: parseTaskBoard(nextText) }
            }
          };
        }
        case 'THEME_TOGGLE':
          return { vm };
        case 'TERMINAL_PANEL_CLOSE': {
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
        case 'TERMINAL_COMMAND_SUBMIT': {
          const id = vm.terminal.activePanelId;
          const existing = vm.terminal.outputByPanel[id] ?? [];
          const next = [...existing, `PS C:> ${intent.command}`, '…（示意输出）'];
          return { vm: { ...vm, terminal: { ...vm.terminal, outputByPanel: { ...vm.terminal.outputByPanel, [id]: next } } } };
        }
        case 'RIGHT_PANEL_ADD': {
          if (vm.rightMode === 'terminal') {
            const nextNum = vm.terminal.panelIds.length + 1;
            const nextId = `terminal-${nextNum}`;
            return {
              vm: {
                ...vm,
                terminal: {
                  panelIds: [...vm.terminal.panelIds, nextId],
                  activePanelId: nextId,
                  outputByPanel: { ...vm.terminal.outputByPanel, [nextId]: ['PS C:> 新终端面板已创建（示意）'] }
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
          if (intent.widthPx <= prev) {
            return { vm: { ...vm, layout: { ...vm.layout, containerWidthPx: intent.widthPx } } };
          }

          const splitters = splitterCountFlags(vm) * SPLITTER_PX;
          const available = Math.max(0, intent.widthPx - splitters);
          const left = vm.leftVisible ? clamp(vm.layout.leftPx, MIN_LEFT_PX, MAX_LEFT_PX) : 0;
          const right = vm.rightVisible ? Math.max(MIN_RIGHT_PX, vm.layout.rightPx) : 0;
          const remainder = Math.max(MIN_CENTER_PX, available - left - right);

          return { vm: { ...vm, layout: { ...vm.layout, containerWidthPx: intent.widthPx, centerPx: remainder } } };
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
                    taskBoard: kind === 'task' ? parseTaskBoard(nextText) : vm2.content.taskBoard
                  }
                }
              };
            });
          })();
          return { vm: { ...vm, content: { ...vm.content, saveStatus: 'saving', saveError: null } } };
        case 'SHORTCUT_FIND':
          return { vm };
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

if (specwaveWindowKind === 'main' && bootProjectPath) {
  useAppStore.getState().dispatch({ type: 'PROJECT_OPEN_RECENT', path: bootProjectPath });
}
