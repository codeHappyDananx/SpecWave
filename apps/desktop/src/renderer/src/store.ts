import { create } from 'zustand';
import type {
  AppViewModel,
  ChatMessageVM,
  ContentKind,
  ContentMode,
  ExplorerNodeVM,
  LeftViewMode,
  PhaseIndicatorVM,
  StepperPhaseVM,
  StoryBoardVM,
  StoryCardVM,
  StoryDocPhase,
  StoryPhase,
  StoryStepperVM,
  UIIntent
} from '@specwave/contracts';

import { dispatchByHandlers } from './store/dispatch';
import type { AppState } from './store/types';
import { normalizeLayoutStable } from './store/shared/layout';
import { toExplorerNodes } from './store/shared/explorer';
import { findMatchStarts } from './store/shared/find';
import { loadLinkedDocs } from './store/shared/linkedDocs';
import { loadProjectsSession } from './store/shared/projectsSession';
import { SELF_WRITE_SILENCE_MS, selfWriteAtByPath } from './store/shared/selfWriteSilence';
import { parseTaskBoardV2 } from './store/shared/taskBoard';
import { basename, detectSep, dirname, extname, joinPath, normalizeFsPath } from './store/shared/path';
import { externalChangePromptState } from './store/shared/externalChangePrompt';

const msg = (who: ChatMessageVM['who'], text: string): ChatMessageVM => ({ who, text });

const terminalUserTyped = new Set<string>();
const terminalSessionEnsured = new Set<string>();
const terminalLastSizeById = new Map<string, { cols: number; rows: number }>();

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

const UI_SESSION_KEY = 'specwave_ui_session_v1';

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

const initialVm: AppViewModel = {
  app: { mode: specwaveWindowKind === 'welcome' ? 'welcome' : 'main', recentProjects: [] },
  projects: restoredProjectsSession ?? { openTabs: [], activeTabId: null },
  explorer: {
    workspaceRoot: null,
    projectRoot: null,
    workspace: [],
    project: [],
    specwaveInit: null,
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
  leftViewMode: 'storyBoard',
  centerVisible: restoredUiSession?.centerVisible ?? true,
  rightVisible: restoredUiSession?.rightVisible ?? true,
  rightMode: restoredUiSession?.rightMode ?? 'terminal',
  globalSearchQuery: '',
  terminal: {
    activePanelId: 'terminal-1',
    panelIds: ['terminal-1'],
    dock: {
      layout: { kind: 'one' },
      regions: [{ id: 'A', tabIds: ['terminal-1'], activeTabId: 'terminal-1' }]
    }
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
  layout: { containerWidthPx: 1280, isDragging: false, leftPx: 280, centerPx: 640, rightPx: 360 },
  storyBoard: {
    isLoading: false,
    stories: [],
    error: null
  },
  phaseIndicator: {
    visible: false,
    storyId: null,
    currentPhase: 'appeal',
    availablePhases: []
  },
  storyStepper: {
    visible: false,
    storyId: null,
    storyTitle: null,
    currentPhase: 'requirement',
    phases: []
  }
};

let openFileSeq = 0;

function isWithinRoot(candidatePath: string, root: string) {
  const c = normalizeFsPath(candidatePath);
  const r = normalizeFsPath(root);
  if (c === r) return true;
  const prefix = r.endsWith('/') ? r : `${r}/`;
  return c.startsWith(prefix);
}

/**
 * 为 Story 目录附加卡片数据
 * 在 stories 目录下的 STORY-xxx 目录会被标记为 Story 卡片
 */
async function enrichStoryNodes(
  nodes: ExplorerNodeVM[],
  parentPath: string,
  isArchiveDir: boolean
): Promise<ExplorerNodeVM[]> {
  const api = window.specwave;
  if (!api) return nodes;

  const enrichedNodes: ExplorerNodeVM[] = [];

  for (const node of nodes) {
    // 只处理 STORY- 开头的目录
    if (node.kind !== 'dir' || !node.name.toUpperCase().startsWith('STORY-')) {
      enrichedNodes.push(node);
      continue;
    }

    // 读取 Story 目录内容
    const res = await api.readDirectory(node.id);
    if (!res.ok) {
      enrichedNodes.push(node);
      continue;
    }

    const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
    let taskContent: string | undefined;

    // 读取任务文件内容以获取进度
    if (fileNames.includes('03-任务.md')) {
      const taskPath = joinPath(node.id, '03-任务.md');
      const taskRes = await api.readTextFile(taskPath);
      if (taskRes.ok) taskContent = taskRes.text;
    }

    // 构建 Story 卡片数据
    const storyCard = buildStoryCardFromDir(node.name, node.id, fileNames, taskContent);

    enrichedNodes.push({
      ...node,
      storyCard,
      isArchived: isArchiveDir
    });
  }

  return enrichedNodes;
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

/**
 * 检测 Story 阶段
 * 根据文件列表和任务内容判断 Story 当前阶段
 */
function detectStoryPhase(files: string[], taskContent?: string): StoryPhase {
  const has01 = files.some(f => f === '01-需求.md');
  const has02 = files.some(f => f === '02-设计.md');
  const has03 = files.some(f => f === '03-任务.md');

  if (!has01 && !has02 && !has03) return 'appeal';
  if (has01 && !has02 && !has03) return 'requirement';
  if (has02 && !has03) return 'design';

  if (has03 && taskContent) {
    const { completed, total } = parseStoryTaskProgress(taskContent);
    if (total > 0 && completed === total) return 'completed';
    if (completed > 0) return 'executing';
  }

  return 'task';
}

/**
 * 解析 Story 任务进度
 * 从任务文档内容中提取已完成/总数
 */
function parseStoryTaskProgress(content: string): { completed: number; total: number } {
  const taskRegex = /^[ \t]*-\s*\[([xX ])\]/gm;
  let total = 0;
  let completed = 0;

  let match;
  while ((match = taskRegex.exec(content)) !== null) {
    total++;
    if (match[1]?.toLowerCase() === 'x') completed++;
  }

  return { completed, total };
}

/**
 * 从 Story 目录名提取标题
 * 如 "STORY-000001(概要)" -> "概要"
 */
function extractStoryTitle(dirName: string): string {
  const match = dirName.match(/\(([^)]+)\)$/);
  return match?.[1] ?? dirName;
}

/**
 * 从目录构建 Story 卡片数据（用于文件浏览器中的 Story 卡片）
 */
function buildStoryCardFromDir(
  dirName: string,
  dirPath: string,
  fileNames: string[],
  taskContent?: string
): StoryCardVM {
  const phase = detectStoryPhase(fileNames, taskContent);
  const taskProgress = taskContent ? parseStoryTaskProgress(taskContent) : null;

  return {
    id: dirName,
    title: extractStoryTitle(dirName),
    phase,
    createdAt: new Date().toISOString(),
    taskProgress: taskProgress && taskProgress.total > 0 ? taskProgress : null,
    path: dirPath
  };
}

/**
 * 构建 Stepper 视图模型
 */
function buildStoryStepper(
  storyId: string,
  storyTitle: string,
  storyPath: string,
  fileNames: string[]
): StoryStepperVM {
  const phaseConfig: Array<{ phase: StoryDocPhase; label: string; fileName: string }> = [
    { phase: 'requirement', label: '需求', fileName: '01-需求.md' },
    { phase: 'design', label: '设计', fileName: '02-设计.md' },
    { phase: 'task', label: '任务', fileName: '03-任务.md' }
  ];

  const phases: StepperPhaseVM[] = phaseConfig.map(({ phase, label, fileName }) => {
    const enabled = fileNames.includes(fileName);
    const filePath = enabled ? joinPath(storyPath, fileName) : null;
    return { phase, label, enabled, filePath };
  });

  // 默认选中需求阶段
  const currentPhase: StoryDocPhase = 'requirement';

  return {
    visible: true,
    storyId,
    storyTitle,
    currentPhase,
    phases
  };
}

/**
 * 检测文件是否在 Story 目录下，返回 Story 信息
 */
function detectStoryContext(
  filePath: string,
  workspaceRoot: string | null
): { storyId: string; storyPath: string } | null {
  if (!workspaceRoot) return null;

  // workspaceRoot 已经是 .specwave/workspace，Story 目录在其下的 stories/ 子目录
  const storiesDir = joinPath(workspaceRoot, 'stories');
  const normalizedPath = normalizeFsPath(filePath);
  const normalizedStoriesDir = normalizeFsPath(storiesDir);

  if (!normalizedPath.startsWith(normalizedStoriesDir + '/')) return null;

  // 提取 Story 目录名（如 STORY-000001(xxx)）
  const relativePath = normalizedPath.slice(normalizedStoriesDir.length + 1);
  const storyDirName = relativePath.split('/')[0];
  if (!storyDirName?.toUpperCase().startsWith('STORY-')) return null;

  // 还原原始路径
  const sep = detectSep(filePath);
  const storyPath = `${storiesDir}${sep}${storyDirName}`;

  return { storyId: storyDirName, storyPath };
}

/**
 * 构建阶段指示器数据
 */
async function buildPhaseIndicator(
  storyPath: string,
  storyId: string
): Promise<PhaseIndicatorVM> {
  const api = window.specwave;
  if (!api) {
    return { visible: false, storyId: null, currentPhase: 'appeal', availablePhases: [] };
  }

  const res = await api.readDirectory(storyPath);
  if (!res.ok) {
    return { visible: false, storyId: null, currentPhase: 'appeal', availablePhases: [] };
  }

  const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
  let taskContent: string | undefined;

  if (fileNames.includes('03-任务.md')) {
    const taskPath = joinPath(storyPath, '03-任务.md');
    const taskRes = await api.readTextFile(taskPath);
    if (taskRes.ok) taskContent = taskRes.text;
  }

  const currentPhase = detectStoryPhase(fileNames, taskContent);

  const phases: StoryPhase[] = ['appeal', 'requirement', 'design', 'task', 'executing', 'completed'];
  const phaseFileMap: Record<string, string | null> = {
    appeal: null,
    requirement: '01-需求.md',
    design: '02-设计.md',
    task: '03-任务.md',
    executing: '03-任务.md',
    completed: '03-任务.md'
  };

  const availablePhases = phases.map((phase) => {
    const fileName = phaseFileMap[phase];
    const enabled = fileName ? fileNames.includes(fileName) : phase === 'appeal';
    const filePath = fileName && enabled ? joinPath(storyPath, fileName) : null;
    return { phase, enabled, filePath };
  });

  return {
    visible: true,
    storyId,
    currentPhase,
    availablePhases
  };
}

function effectiveContentText(content: AppViewModel['content']) {
  return content.isDirty ? content.draftText : content.text;
}

export const useAppStore = create<AppState>((set, get) => ({
  vm: initialVm,
  intentLog: [],
  drag: null,
  dispatch: (intent) => {
    set((state) => ({ intentLog: [`${new Date().toLocaleTimeString()} ${intent.type}`, ...state.intentLog].slice(0, 30) }));

    set((state) => {
      const handled = dispatchByHandlers({
        ctx: {
          set,
          get,
          dispatch: get().dispatch,
          terminalUserTyped,
          terminalSessionEnsured,
          terminalLastSizeById,
          specwaveWindowKind,
          bootProjectPath,
          initialVm
        },
        state,
        intent
      });
      if (handled) return handled;

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
        case 'LEFT_VIEW_MODE_SET':
          return { vm: { ...vm, leftViewMode: intent.mode } };
        case 'STORY_BOARD_LOAD':
        case 'STORY_BOARD_REFRESH': {
          const storiesDir = vm.explorer.workspaceRoot ? joinPath(vm.explorer.workspaceRoot, 'stories') : null;
          if (!storiesDir) {
            return { vm: { ...vm, storyBoard: { isLoading: false, stories: [], error: null } } };
          }

          void (async () => {
            const api = window.specwave;
            if (!api) return;

            const res = await api.readDirectory(storiesDir);
            if (!res.ok) {
              set((state) => ({
                vm: {
                  ...state.vm,
                  storyBoard: {
                    isLoading: false,
                    stories: [],
                    error: res.error.includes('ENOENT') ? null : res.error
                  }
                }
              }));
              return;
            }

            const storyDirs = res.entries.filter((e) => e.kind === 'dir' && e.name.startsWith('STORY-'));
            const stories: StoryCardVM[] = [];

            for (const dir of storyDirs) {
              const filesRes = await api.readDirectory(dir.path);
              if (!filesRes.ok) continue;

              const fileNames = filesRes.entries.filter((e) => e.kind === 'file').map((e) => e.name);
              let taskContent: string | undefined;

              if (fileNames.includes('03-任务.md')) {
                const taskPath = joinPath(dir.path, '03-任务.md');
                const taskRes = await api.readTextFile(taskPath);
                if (taskRes.ok) taskContent = taskRes.text;
              }

              const phase = detectStoryPhase(fileNames, taskContent);
              const taskProgress = taskContent ? parseStoryTaskProgress(taskContent) : null;

              stories.push({
                id: dir.name,
                title: extractStoryTitle(dir.name),
                phase,
                createdAt: new Date().toISOString(),
                taskProgress: taskProgress && taskProgress.total > 0 ? taskProgress : null,
                path: dir.path
              });
            }

            set((state) => ({
              vm: {
                ...state.vm,
                storyBoard: { isLoading: false, stories, error: null }
              }
            }));
          })();

          return { vm: { ...vm, storyBoard: { ...vm.storyBoard, isLoading: true, error: null } } };
        }
        case 'STORY_CARD_CLICK': {
          const story = vm.storyBoard.stories.find((s) => s.id === intent.storyId);
          if (!story) return { vm };

          // 展开文件树并选中 Story 目录
          const tree: 'workspace' | 'project' = 'workspace';
          const expanded = vm.explorer.expanded[tree];
          const storiesDir = vm.explorer.workspaceRoot ? joinPath(vm.explorer.workspaceRoot, 'stories') : null;

          const nextExpanded = storiesDir && !expanded.includes(storiesDir)
            ? [...expanded, storiesDir, story.path]
            : expanded.includes(story.path) ? expanded : [...expanded, story.path];

          return {
            vm: {
              ...vm,
              leftViewMode: 'explorer',
              explorer: {
                ...vm.explorer,
                expanded: { ...vm.explorer.expanded, [tree]: nextExpanded },
                selectedPath: story.path
              }
            }
          };
        }
        case 'PHASE_INDICATOR_CLICK': {
          const indicator = vm.phaseIndicator;
          if (!indicator.visible || !indicator.storyId) return { vm };

          const targetPhase = indicator.availablePhases.find((p) => p.phase === intent.phase);
          if (!targetPhase?.enabled || !targetPhase.filePath) return { vm };

          // 触发打开文件
          queueMicrotask(() => get().dispatch({ type: 'EXPLORER_OPEN_FILE', path: targetPhase.filePath! }));
          return { vm };
        }
        case 'STORY_CARD_SELECT': {
          // 点击 Story 卡片：设置 Stepper 状态并打开需求文档
          const { storyId, storyPath } = intent;

          void (async () => {
            const api = window.specwave;
            if (!api) return;

            // 读取 Story 目录获取文件列表
            const res = await api.readDirectory(storyPath);
            if (!res.ok) return;

            const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
            const storyTitle = extractStoryTitle(storyId);

            // 构建 Stepper 状态
            const storyStepper = buildStoryStepper(storyId, storyTitle, storyPath, fileNames);

            set((state) => ({
              vm: { ...state.vm, storyStepper }
            }));

            // 打开需求文档
            const reqPhase = storyStepper.phases.find((p) => p.phase === 'requirement');
            if (reqPhase?.enabled && reqPhase.filePath) {
              get().dispatch({ type: 'EXPLORER_OPEN_FILE', path: reqPhase.filePath });
            }
          })();

          return { vm };
        }
        case 'STORY_STEPPER_PHASE_CLICK': {
          const stepper = vm.storyStepper;
          if (!stepper.visible || !stepper.storyId) return { vm };

          const targetPhase = stepper.phases.find((p) => p.phase === intent.phase);
          if (!targetPhase?.enabled || !targetPhase.filePath) return { vm };

          // 更新当前阶段并打开对应文档
          const nextStepper: StoryStepperVM = {
            ...stepper,
            currentPhase: intent.phase
          };

          queueMicrotask(() => get().dispatch({ type: 'EXPLORER_OPEN_FILE', path: targetPhase.filePath! }));

          return { vm: { ...vm, storyStepper: nextStepper } };
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

              // 检测是否是 stories 目录或 archive 目录
              const dirName = basename(intent.id);
              const parentDir = dirname(intent.id);
              const parentDirName = basename(parentDir);
              const grandParentDir = dirname(parentDir);
              const grandParentDirName = basename(grandParentDir);
              
              const isStoriesDir = dirName === 'stories';
              // archive 目录可能在 stories/archive 或 workspace/archive
              const isArchiveDir = dirName === 'archive' && (parentDirName === 'stories' || parentDirName === 'workspace');
              // 日期归档目录（如 20260107-归档）在 stories/archive 下
              const isDateArchiveDir = parentDirName === 'archive' && grandParentDirName === 'stories';
              // workspace/archive 下直接是 STORY 目录
              const isWorkspaceArchiveDir = dirName === 'archive' && parentDirName === 'workspace';

              let childNodes = res.ok ? toExplorerNodes(res.entries) : [];

              // 如果是 stories、archive 或日期归档目录，为 Story 目录附加卡片数据
              const shouldEnrichStories = isStoriesDir || isArchiveDir || isDateArchiveDir || isWorkspaceArchiveDir;
              const isArchiveContext = isArchiveDir || isDateArchiveDir || isWorkspaceArchiveDir;
              
              if (res.ok && shouldEnrichStories) {
                childNodes = await enrichStoryNodes(childNodes, intent.id, isArchiveContext);
              }

              set((state) => {
                const vm2 = state.vm;
                const nodes2 = tree === 'workspace' ? vm2.explorer.workspace : vm2.explorer.project;
                const nextNodes = updateNodeById(nodes2, intent.id, (n) => ({
                  ...n,
                  isLoading: false,
                  children: childNodes,
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

          // 检测是否在 Story 目录下，更新阶段指示器和 Stepper
          const storyContext = detectStoryContext(filePath, vm.explorer.workspaceRoot);
          
          // 同步计算新的 Stepper 状态，避免闪烁
          let nextStoryStepper = vm.storyStepper;
          if (!storyContext) {
            // 非 Story 文件，立即隐藏 Stepper
            nextStoryStepper = { visible: false, storyId: null, storyTitle: null, currentPhase: 'requirement', phases: [] };
          } else if (storyContext.storyId === vm.storyStepper.storyId) {
            // 同一个 Story，只更新当前阶段
            const fileName = basename(filePath);
            let newPhase: StoryDocPhase = vm.storyStepper.currentPhase;
            if (fileName === '01-需求.md') newPhase = 'requirement';
            else if (fileName === '02-设计.md') newPhase = 'design';
            else if (fileName === '03-任务.md') newPhase = 'task';
            if (newPhase !== vm.storyStepper.currentPhase) {
              nextStoryStepper = { ...vm.storyStepper, currentPhase: newPhase };
            }
          }
          // 不同 Story 的情况在异步中处理
          
          if (storyContext) {
            void (async () => {
              const indicator = await buildPhaseIndicator(storyContext.storyPath, storyContext.storyId);
              set((state) => ({
                vm: { ...state.vm, phaseIndicator: indicator }
              }));
            })();
            
            // 检查当前 Stepper 是否属于同一个 Story
            const currentStepperId = vm.storyStepper.storyId;
            if (currentStepperId !== storyContext.storyId) {
              // 不同 Story，异步更新 Stepper
              void (async () => {
                const api = window.specwave;
                if (!api) return;
                const res = await api.readDirectory(storyContext.storyPath);
                if (!res.ok) return;
                const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
                const storyTitle = extractStoryTitle(storyContext.storyId);
                const storyStepper = buildStoryStepper(storyContext.storyId, storyTitle, storyContext.storyPath, fileNames);
                // 根据当前打开的文件设置当前阶段
                const fileName = basename(filePath);
                if (fileName === '01-需求.md') storyStepper.currentPhase = 'requirement';
                else if (fileName === '02-设计.md') storyStepper.currentPhase = 'design';
                else if (fileName === '03-任务.md') storyStepper.currentPhase = 'task';
                set((state) => ({ vm: { ...state.vm, storyStepper } }));
              })();
            }
          } else {
            // 非 Story 文件，异步隐藏阶段指示器
            void (async () => {
              set((state) => ({
                vm: {
                  ...state.vm,
                  phaseIndicator: { visible: false, storyId: null, currentPhase: 'appeal', availablePhases: [] }
                }
              }));
            })();
          }

          externalChangePromptState.suppressExternalChangePromptPath = null;

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
                storyStepper: nextStoryStepper,
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
              content: { ...vm.content, saveStatus: 'idle', saveError: null, find: { ...initialVm.content.find } },
              storyStepper: nextStoryStepper
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
        case 'RIGHT_PANEL_ADD':
          // 已迁移到 store/handlers/panel.ts：避免此处与 handlers 双写产生状态不一致
          return { vm };
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
      if (
        externalChangePromptState.suppressExternalChangePromptPath &&
        normalizeFsPath(externalChangePromptState.suppressExternalChangePromptPath) === normalizeFsPath(filePath)
      ) {
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
        externalChangePromptState.suppressExternalChangePromptPath = filePath;
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

    externalChangePromptState.suppressExternalChangePromptPath = null;

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
