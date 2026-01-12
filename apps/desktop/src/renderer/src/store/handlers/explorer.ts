import type {
  ContentKind,
  ContentMode,
  ExplorerNodeVM,
  LinkedDocVM,
  PhaseIndicatorVM,
  StepperPhaseVM,
  StoryCardVM,
  StoryDocPhase,
  StoryPhase,
  StoryStepperVM,
  TaskBoardVM,
  TaskItemVM,
  UIIntent
} from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { toExplorerNodes } from '../shared/explorer';
import { basename, detectSep, dirname, extname, joinPath, normalizeFsPath } from '../shared/path';
import { externalChangePromptState } from '../shared/externalChangePrompt';

type UiSessionSnapshot = {
  leftVisible?: boolean;
  centerVisible?: boolean;
  rightVisible?: boolean;
  rightMode?: 'terminal' | 'chat';
  explorerExpanded?: { workspace?: string[]; project?: string[] };
  explorerSelectedPath?: string | null;
  lastOpenFilePath?: string | null;
  projectRoot?: string | null;
  workspaceRoot?: string | null;
};

const UI_SESSION_KEY = 'specwave_ui_session_v1';

function persistUiSession(snap: UiSessionSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(UI_SESSION_KEY, JSON.stringify(snap));
    window.localStorage.setItem(UI_SESSION_KEY, JSON.stringify(snap));
  } catch {}
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

function parseLinkedRefs(blockText: string): string[] {
  const match = blockText.match(/关联需求[：:]\s*(.+)$/m);
  if (!match?.[1]) return [];

  return match[1]
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter((s) => /^(REQ|AC)-\d+$/.test(s));
}

function extractDocSection(
  docText: string,
  refId: string
): { title: string; content: string; lineNumber: number } | null {
  const lines = docText.split('\n');

  if (refId.startsWith('REQ-')) {
    const pattern = new RegExp(`^###\\s+${refId}\\b`);
    const startIdx = lines.findIndex((line) => pattern.test(line));
    if (startIdx < 0) return null;

    const titleLine = lines[startIdx] ?? '';
    const title = titleLine.replace(/^###\s+REQ-\d+\s*/, '').trim();

    let endIdx = lines.findIndex((line, i) => i > startIdx && /^#{2,3}\s+/.test(line));
    if (endIdx < 0) endIdx = lines.length;

    return {
      title,
      content: lines.slice(startIdx, endIdx).join('\n').trim(),
      lineNumber: startIdx + 1
    };
  }

  if (refId.startsWith('AC-')) {
    const pattern = new RegExp(`^-\\s+\\*\\*${refId}\\*\\*`);
    const lineIdx = lines.findIndex((line) => pattern.test(line));
    if (lineIdx < 0) return null;

    let endIdx = lineIdx + 1;
    while (endIdx < lines.length) {
      const line = lines[endIdx] ?? '';
      if (/^-\s+\*\*AC-\d+\*\*/.test(line)) break;
      if (/^#{1,3}\s+/.test(line)) break;
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

async function loadLinkedDocs(taskFilePath: string, linkedRefs: string[]): Promise<LinkedDocVM[]> {
  if (!linkedRefs.length) return [];

  const api = window.specwave;
  if (!api) return [];

  const dirPath = taskFilePath.replace(/[/\\][^/\\]+$/, '');
  const reqFilePath = `${dirPath}/01-需求.md`;

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

function detectStoryPhase(files: string[], taskContent?: string): StoryPhase {
  const has01 = files.some((f) => f === '01-需求.md');
  const has02 = files.some((f) => f === '02-设计.md');
  const has03 = files.some((f) => f === '03-任务.md');

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

function extractStoryTitle(dirName: string): string {
  const match = dirName.match(/\(([^)]+)\)$/);
  return match?.[1] ?? dirName;
}

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

function buildStoryStepper(storyId: string, storyTitle: string, storyPath: string, fileNames: string[]): StoryStepperVM {
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

  const currentPhase: StoryDocPhase = 'requirement';

  return {
    visible: true,
    storyId,
    storyTitle,
    currentPhase,
    phases
  };
}

function detectStoryContext(
  filePath: string,
  workspaceRoot: string | null
): { storyId: string; storyPath: string } | null {
  if (!workspaceRoot) return null;

  const storiesDir = joinPath(workspaceRoot, 'stories');
  const normalizedPath = normalizeFsPath(filePath);
  const normalizedStoriesDir = normalizeFsPath(storiesDir);

  if (!normalizedPath.startsWith(normalizedStoriesDir + '/')) return null;

  const relativePath = normalizedPath.slice(normalizedStoriesDir.length + 1);
  const storyDirName = relativePath.split('/')[0];
  if (!storyDirName?.toUpperCase().startsWith('STORY-')) return null;

  const sep = detectSep(filePath);
  const storyPath = `${storiesDir}${sep}${storyDirName}`;

  return { storyId: storyDirName, storyPath };
}

async function buildPhaseIndicator(storyPath: string, storyId: string): Promise<PhaseIndicatorVM> {
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

async function enrichStoryNodes(nodes: ExplorerNodeVM[], parentPath: string, isArchiveDir: boolean): Promise<ExplorerNodeVM[]> {
  const api = window.specwave;
  if (!api) return nodes;

  const enrichedNodes: ExplorerNodeVM[] = [];

  for (const node of nodes) {
    if (node.kind !== 'dir' || !node.name.toUpperCase().startsWith('STORY-')) {
      enrichedNodes.push(node);
      continue;
    }

    const res = await api.readDirectory(node.id);
    if (!res.ok) {
      enrichedNodes.push(node);
      continue;
    }

    const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
    let taskContent: string | undefined;

    if (fileNames.includes('03-任务.md')) {
      const taskPath = joinPath(node.id, '03-任务.md');
      const taskRes = await api.readTextFile(taskPath);
      if (taskRes.ok) taskContent = taskRes.text;
    }

    const storyCard = buildStoryCardFromDir(node.name, node.id, fileNames, taskContent);

    enrichedNodes.push({
      ...node,
      storyCard,
      isArchived: isArchiveDir
    });
  }

  return enrichedNodes;
}

let openFileSeq = 0;

/**
 * Explorer handler（文件树/打开文件/在系统中定位）
 *
 * - 处理 intent：
 *   - EXPLORER_SHOW_IGNORED_SET / EXPLORER_TOGGLE_DIR / EXPLORER_OPEN_FILE / EXPLORER_REVEAL_IN_OS
 * - 读写的 VM 字段：
 *   - explorer（expanded/selectedPath/showIgnored/workspace/project）
 *   - content（打开文件后的内容装载）
 *   - phaseIndicator / storyStepper（打开 Story 文档时同步）
 * - 副作用：
 *   - preload：readDirectory/readTextFile/readBinaryFile/revealInFolder
 *   - storage：localStorage（showIgnored）、sessionStorage（最后打开文件快照）
 */
export function handleExplorerIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'EXPLORER_SHOW_IGNORED_SET': {
      const nextShowIgnored = intent.showIgnored;
      try {
        window.localStorage.setItem('specwave_explorer_show_ignored', nextShowIgnored ? '1' : '0');
      } catch {}
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

          const dirName = basename(intent.id);
          const parentDir = dirname(intent.id);
          const parentDirName = basename(parentDir);
          const grandParentDir = dirname(parentDir);
          const grandParentDirName = basename(grandParentDir);

          const isStoriesDir = dirName === 'stories';
          const isArchiveDir = dirName === 'archive' && (parentDirName === 'stories' || parentDirName === 'workspace');
          const isDateArchiveDir = parentDirName === 'archive' && grandParentDirName === 'stories';
          const isWorkspaceArchiveDir = dirName === 'archive' && parentDirName === 'workspace';

          let childNodes = res.ok ? toExplorerNodes(res.entries) : [];

          const shouldEnrichStories = isStoriesDir || isArchiveDir || isDateArchiveDir || isWorkspaceArchiveDir;
          const isArchiveContext = isArchiveDir || isDateArchiveDir || isWorkspaceArchiveDir;

          if (res.ok && shouldEnrichStories) {
            childNodes = await enrichStoryNodes(childNodes, intent.id, isArchiveContext);
          }

          ctx.set((state2) => {
            const vm2 = state2.vm;
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

      const storyContext = detectStoryContext(filePath, vm.explorer.workspaceRoot);

      const hiddenPhaseIndicator: PhaseIndicatorVM = { visible: false, storyId: null, currentPhase: 'appeal', availablePhases: [] };

      let nextStoryStepper = vm.storyStepper;
      if (!storyContext) {
        nextStoryStepper = { visible: false, storyId: null, storyTitle: null, currentPhase: 'requirement', phases: [] };
      } else if (storyContext.storyId === vm.storyStepper.storyId) {
        const fileName = basename(filePath);
        let newPhase: StoryDocPhase = vm.storyStepper.currentPhase;
        if (fileName === '01-需求.md') newPhase = 'requirement';
        else if (fileName === '02-设计.md') newPhase = 'design';
        else if (fileName === '03-任务.md') newPhase = 'task';
        if (newPhase !== vm.storyStepper.currentPhase) {
          nextStoryStepper = { ...vm.storyStepper, currentPhase: newPhase };
        }
      }

      if (storyContext) {
        void (async () => {
          const indicator = await buildPhaseIndicator(storyContext.storyPath, storyContext.storyId);
          if (seq !== openFileSeq) return;
          const selected = ctx.get().vm.explorer.selectedPath;
          if (!selected || normalizeFsPath(selected) !== normalizeFsPath(filePath)) return;
          ctx.set((state2) => ({ vm: { ...state2.vm, phaseIndicator: indicator } }));
        })();

        const currentStepperId = vm.storyStepper.storyId;
        if (currentStepperId !== storyContext.storyId) {
          void (async () => {
            const api = window.specwave;
            if (!api) return;
            const res = await api.readDirectory(storyContext.storyPath);
            if (!res.ok) return;
            if (seq !== openFileSeq) return;
            const selected = ctx.get().vm.explorer.selectedPath;
            if (!selected || normalizeFsPath(selected) !== normalizeFsPath(filePath)) return;
            const fileNames = res.entries.filter((e) => e.kind === 'file').map((e) => e.name);
            const storyTitle = extractStoryTitle(storyContext.storyId);
            const storyStepper = buildStoryStepper(storyContext.storyId, storyTitle, storyContext.storyPath, fileNames);
            const fileName = basename(filePath);
            if (fileName === '01-需求.md') storyStepper.currentPhase = 'requirement';
            else if (fileName === '02-设计.md') storyStepper.currentPhase = 'design';
            else if (fileName === '03-任务.md') storyStepper.currentPhase = 'task';
            ctx.set((state2) => ({ vm: { ...state2.vm, storyStepper } }));
          })();
        }
      }

      externalChangePromptState.suppressExternalChangePromptPath = null;

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
            phaseIndicator: storyContext ? vm.phaseIndicator : hiddenPhaseIndicator,
            content: {
              ...vm.content,
              find: { ...ctx.initialVm.content.find },
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

        ctx.set((state2) => {
          const vm2 = state2.vm;
          if (vm2.explorer.selectedPath !== filePath) return { vm: vm2 };

          if (!res.ok) {
            return {
              vm: {
                ...vm2,
                content: { ...vm2.content, saveStatus: 'error', saveError: res.error }
              }
            };
          }

          const mode = (() => {
            const defaultMode = defaultContentMode(kind);
            if (kind === 'text' && res.text.length > 300_000) return 'view' as const;
            return defaultMode;
          })();
          const taskBoard = kind === 'task' ? parseTaskBoardV2(res.text, null) : null;

          if (taskBoard && taskBoard.activeTaskId) {
            const activeItem = taskBoard.items.find((t) => t.id === taskBoard.activeTaskId);
            if (activeItem && activeItem.linkedRefs.length > 0) {
              void (async () => {
                const linkedDocs = await loadLinkedDocs(filePath, activeItem.linkedRefs);
                ctx.set((state3) => {
                  const currentBoard = state3.vm.content.taskBoard;
                  if (!currentBoard) return { vm: state3.vm };
                  return {
                    vm: {
                      ...state3.vm,
                      content: {
                        ...state3.vm.content,
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
                find: { ...ctx.initialVm.content.find },
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
          content: { ...vm.content, saveStatus: 'idle', saveError: null, find: { ...ctx.initialVm.content.find } },
          storyStepper: nextStoryStepper,
          phaseIndicator: storyContext ? vm.phaseIndicator : hiddenPhaseIndicator
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
    default:
      return null;
  }
}
