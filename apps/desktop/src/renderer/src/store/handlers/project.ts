import type { AppViewModel, UIIntent } from '@specwave/contracts';

import type { AppState, StoreCtx } from '../types';
import { toExplorerNodes } from '../shared/explorer';
import { basename, joinPath, normalizeFsPath } from '../shared/path';
import { persistProjectsSession } from '../shared/projectsSession';

type ProjectTab = AppViewModel['projects']['openTabs'][number];

let openProjectSeq = 0;

// 最近激活的项目页签（仅用于“关闭后切回上一个项目”的回退规则；不进 ViewModel）。
let projectTabActivationHistory: string[] = [];

function resetStoryUi(initialVm: AppViewModel) {
  return {
    phaseIndicator: { ...initialVm.phaseIndicator },
    storyStepper: { ...initialVm.storyStepper }
  };
}

function ensureProjectTabActivationHistorySeeded(vm: AppViewModel) {
  if (projectTabActivationHistory.length > 0) return;
  const active = vm.projects.activeTabId;
  if (active) projectTabActivationHistory = [active];
}

function recordProjectTabActivation(vm: AppViewModel, tabId: string | null) {
  if (!tabId) return;
  ensureProjectTabActivationHistorySeeded(vm);
  projectTabActivationHistory = [tabId, ...projectTabActivationHistory.filter((id) => id !== tabId)].slice(0, 20);
}

function removeProjectTabFromHistory(vm: AppViewModel, tabId: string) {
  ensureProjectTabActivationHistorySeeded(vm);
  projectTabActivationHistory = projectTabActivationHistory.filter((id) => id !== tabId);
}

function pickMostRecentExistingProjectTabId(vm: AppViewModel, args: { availableTabs: ProjectTab[]; excludedId: string }): string | null {
  ensureProjectTabActivationHistorySeeded(vm);
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

async function restartIdleTerminalSessionsToCwd(args: {
  api: Window['specwave'] | undefined;
  cwd: string;
  terminalIds: string[];
  ctx: StoreCtx;
}) {
  const api = args.api;
  if (!api?.terminalCreateSession) return;

  args.ctx.set((state) => {
    const vm2 = state.vm;
    const nextOutput = { ...vm2.terminal.outputByPanel };
    for (const id of args.terminalIds) {
      if (args.ctx.terminalUserTyped.has(id)) continue;
      nextOutput[id] = ['正在启动终端…\r\n'];
    }
    return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: nextOutput } } };
  });

  for (const id of args.terminalIds) {
    if (args.ctx.terminalUserTyped.has(id)) continue;
    const res = await api.terminalCreateSession({ id, cwd: args.cwd });
    if (res.ok) continue;
    args.ctx.set((state) => {
      const vm2 = state.vm;
      const prev = vm2.terminal.outputByPanel[id] ?? [];
      const next = [...prev, `\r\n[终端启动失败] ${res.error}\r\n`];
      return { vm: { ...vm2, terminal: { ...vm2.terminal, outputByPanel: { ...vm2.terminal.outputByPanel, [id]: next } } } };
    });
  }
}

/**
 * 项目处理器（项目页签/最近项目/全局搜索）
 *
 * - 处理意图：
 *   - GLOBAL_SEARCH_SET
 *   - PROJECT_TAB_ADD_EMPTY / PROJECT_TAB_SET_ACTIVE / PROJECT_TAB_CLOSE
 *   - PROJECT_SELECT / PROJECT_OPEN_RECENT
 *   - RECENT_PROJECT_REMOVE
 * - 读写的 VM 字段：
 *   - projects / app.recentProjects / explorer / content / globalSearchQuery
 * - 副作用：
 *   - 与 preload API 交互：读目录、启动监听、打开窗口、维护最近项目、重建终端会话
 */
export function handleProjectIntent(args: { ctx: StoreCtx; state: AppState; intent: UIIntent }): Partial<AppState> | null {
  const { ctx, state, intent } = args;
  const vm = state.vm;

  switch (intent.type) {
    case 'GLOBAL_SEARCH_SET':
      return { vm: { ...vm, globalSearchQuery: intent.query } };
    case 'PROJECT_TAB_ADD_EMPTY': {
      const tabId = `proj-empty-${Date.now()}`;
      const nextProjects: AppViewModel['projects'] = {
        openTabs: [...vm.projects.openTabs, { id: tabId, folderName: '未打开', path: null }],
        activeTabId: tabId
      };
      recordProjectTabActivation(vm, tabId);
      persistProjectsSession(nextProjects);
      return {
        vm: {
          ...vm,
          app: { ...vm.app, mode: 'main' },
          projects: nextProjects,
          explorer: { ...ctx.initialVm.explorer, showIgnored: vm.explorer.showIgnored },
          content: { ...ctx.initialVm.content },
          ...resetStoryUi(ctx.initialVm)
        }
      };
    }
    case 'PROJECT_SELECT': {
      const seq = ++openProjectSeq;
      void (async () => {
        const api = window.specwave;
        if (!api) {
          ctx.set((s) => ({
            vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: '未检测到桌面端 API（preload 未注入）。' } }
          }));
          return;
        }

        const dirPath = await api.selectDirectory();
        if (!dirPath) {
          ctx.set((s) => ({ vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false } } }));
          return;
        }

        if (ctx.specwaveWindowKind === 'welcome' && api.openMainWindow) {
          try {
            await api.openMainWindow(dirPath);
          } catch (err) {
            ctx.set((s) => ({
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
        if (ctx.specwaveWindowKind === 'main' && !ctx.bootProjectPath) {
          await restartIdleTerminalSessionsToCwd({
            api,
            cwd: dirPath,
            terminalIds: ctx.get().vm.terminal.panelIds,
            ctx
          });
        }

        const projectName = basename(dirPath);
        const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

        const tabId = (() => {
          const current = ctx.get().vm.projects;
          const active = current.activeTabId ? current.openTabs.find((t) => t.id === current.activeTabId) : null;
          if (active && active.path == null) return active.id;
          return `proj-${Date.now()}`;
        })();

        const [workspaceRes, projectRes] = await Promise.all([api.readDirectory(workspaceRoot), api.readDirectory(dirPath)]);
        if (seq !== openProjectSeq) return;

        if (!projectRes.ok) {
          ctx.set((s) => ({
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

        const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : ctx.get().vm.app.recentProjects;
        if (seq !== openProjectSeq) return;

        ctx.set((state2) => {
          const vm2 = state2.vm;
          const existing = vm2.projects.openTabs.find((t) => t.id === tabId);
          const nextTabs = existing
            ? vm2.projects.openTabs.map((t) => (t.id === tabId ? { ...t, folderName: projectName, path: dirPath } : t))
            : [...vm2.projects.openTabs, { id: tabId, folderName: projectName, path: dirPath }];
          const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: tabId };

          recordProjectTabActivation(vm2, tabId);
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
              content: { ...ctx.initialVm.content },
              ...resetStoryUi(ctx.initialVm)
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
          ctx.set((s) => ({
            vm: { ...s.vm, explorer: { ...s.vm.explorer, isLoading: false, error: '未检测到桌面端 API（preload 未注入）。' } }
          }));
          return;
        }

        if (ctx.specwaveWindowKind === 'welcome' && api.openMainWindow) {
          try {
            await api.openMainWindow(dirPath);
          } catch (err) {
            ctx.set((s) => ({
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

        if (ctx.specwaveWindowKind === 'main' && !ctx.bootProjectPath) {
          await restartIdleTerminalSessionsToCwd({
            api,
            cwd: dirPath,
            terminalIds: ctx.get().vm.terminal.panelIds,
            ctx
          });
        }

        const projectName = basename(dirPath);
        const workspaceRoot = joinPath(dirPath, '.specwave', 'workspace');

        const tabId = (() => {
          const current = ctx.get().vm.projects;
          const active = current.activeTabId ? current.openTabs.find((t) => t.id === current.activeTabId) : null;
          if (active && active.path == null) return active.id;
          return `proj-${Date.now()}`;
        })();

        const [workspaceRes, projectRes] = await Promise.all([api.readDirectory(workspaceRoot), api.readDirectory(dirPath)]);
        if (seq !== openProjectSeq) return;

        if (!projectRes.ok) {
          ctx.set((s) => ({
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

        const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : ctx.get().vm.app.recentProjects;
        if (seq !== openProjectSeq) return;

        ctx.set((state2) => {
          const vm2 = state2.vm;
          const existing = vm2.projects.openTabs.find((t) => t.id === tabId);
          const nextTabs = existing
            ? vm2.projects.openTabs.map((t) => (t.id === tabId ? { ...t, folderName: projectName, path: dirPath } : t))
            : [...vm2.projects.openTabs, { id: tabId, folderName: projectName, path: dirPath }];
          const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: tabId };

          recordProjectTabActivation(vm2, tabId);
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
              content: { ...ctx.initialVm.content },
              ...resetStoryUi(ctx.initialVm)
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
        ctx.set((state2) => ({ vm: { ...state2.vm, app: { ...state2.vm.app, recentProjects } } }));
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

      recordProjectTabActivation(vm, targetTab.id);

      if (targetTab.path == null) {
        void window.specwave?.fsWatchStart?.({ workspaceRoot: null, projectRoot: null });
        const nextProjects: AppViewModel['projects'] = { ...vm.projects, activeTabId: targetTab.id };
        persistProjectsSession(nextProjects);
        return {
          vm: {
            ...vm,
            app: { ...vm.app, mode: 'main' },
            projects: nextProjects,
            explorer: { ...ctx.initialVm.explorer, showIgnored: vm.explorer.showIgnored },
            content: { ...ctx.initialVm.content },
            ...resetStoryUi(ctx.initialVm)
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
          ctx.set((s) => ({
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

        const recentProjects = api.touchRecentProject ? await api.touchRecentProject(dirPath) : ctx.get().vm.app.recentProjects;
        if (seq !== openProjectSeq) return;

        ctx.set((state2) => {
          const vm2 = state2.vm;
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
              content: { ...ctx.initialVm.content },
              ...resetStoryUi(ctx.initialVm)
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
            ...ctx.initialVm.explorer,
            showIgnored: vm.explorer.showIgnored,
            workspaceRoot,
            projectRoot: dirPath,
            isLoading: true,
            error: null
          },
          content: { ...ctx.initialVm.content },
          ...resetStoryUi(ctx.initialVm)
        }
      };
    }
    case 'PROJECT_TAB_CLOSE': {
      const tabsBefore = vm.projects.openTabs;
      const nextTabs = tabsBefore.filter((t) => t.id !== intent.id);
      const wasActive = vm.projects.activeTabId === intent.id;

      removeProjectTabFromHistory(vm, intent.id);

      // 关闭 active tab 后优先切回“上一次激活的项目”；没有历史再按相邻规则（右优先，其次左），最后才兜底取第一个。
      const nextActive = wasActive
        ? (pickMostRecentExistingProjectTabId(vm, { availableTabs: nextTabs, excludedId: intent.id }) ??
          pickNeighborProjectTabId({ tabsBefore, tabsAfter: nextTabs, closedId: intent.id }))
        : vm.projects.activeTabId;

      const isEmpty = nextTabs.length === 0;
      if (!isEmpty) {
        const nextProjects: AppViewModel['projects'] = { openTabs: nextTabs, activeTabId: nextActive };
        if (wasActive) recordProjectTabActivation(vm, nextActive);
        persistProjectsSession(nextProjects);

        const nextVm = { ...vm, projects: nextProjects };
        if (wasActive && nextActive) {
          queueMicrotask(() => ctx.dispatch({ type: 'PROJECT_TAB_SET_ACTIVE', id: nextActive }));
        }
        return { vm: nextVm };
      }

      persistProjectsSession({ openTabs: [], activeTabId: null });

      if (ctx.specwaveWindowKind === 'main') {
        void window.specwave?.fsWatchStart?.({ workspaceRoot: null, projectRoot: null });
        void (async () => {
          const api = window.specwave;
          if (api?.openWelcomeWindow) {
            try {
              await api.openWelcomeWindow();
              return;
            } catch {}
          }

          ctx.set((s) => ({
            vm: {
              ...s.vm,
              app: { ...s.vm.app, mode: 'welcome' },
              projects: { openTabs: [], activeTabId: null },
              explorer: { ...ctx.initialVm.explorer, showIgnored: s.vm.explorer.showIgnored },
              content: { ...ctx.initialVm.content },
              ...resetStoryUi(ctx.initialVm)
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
          explorer: { ...ctx.initialVm.explorer, showIgnored: vm.explorer.showIgnored },
          content: { ...ctx.initialVm.content },
          ...resetStoryUi(ctx.initialVm)
        }
      };
    }
    default:
      return null;
  }
}
