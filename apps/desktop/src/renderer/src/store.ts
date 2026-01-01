import { create } from 'zustand';
import type { AppViewModel, ChatMessageVM, UIIntent } from '@specwave/contracts';

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

const initialVm: AppViewModel = {
  projects: {
    openTabs: [{ id: 'proj-1', folderName: 'openspec-visualizer' }],
    activeTabId: 'proj-1'
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
  ui: { centerMode: 'work', theme: 'light' },
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
        case 'RIGHT_MODE_SET':
          {
            const nextVm = { ...vm, rightMode: intent.mode, rightVisible: true };
            const nextLayout = normalizeLayoutStable(nextVm);
            return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
          }
        case 'GLOBAL_SEARCH_SET':
          return { vm: { ...vm, globalSearchQuery: intent.query } };
        case 'CENTER_MODE_SET':
          {
            const nextVm = { ...vm, ui: { ...vm.ui, centerMode: intent.mode }, centerVisible: true };
            const nextLayout = normalizeLayoutStable(nextVm);
            return { vm: { ...nextVm, layout: { ...nextVm.layout, ...nextLayout } } };
          }
        case 'PROJECT_OPEN_MOCK': {
          const nextIdx = vm.projects.openTabs.length + 1;
          const next = { id: `proj-${nextIdx}`, folderName: `project-${nextIdx}` };
          return {
            vm: {
              ...vm,
              projects: {
                openTabs: [...vm.projects.openTabs, next],
                activeTabId: next.id
              }
            }
          };
        }
        case 'PROJECT_TAB_SET_ACTIVE':
          return { vm: { ...vm, projects: { ...vm.projects, activeTabId: intent.id } } };
        case 'PROJECT_TAB_CLOSE': {
          const nextTabs = vm.projects.openTabs.filter((t) => t.id !== intent.id);
          const nextActive =
            vm.projects.activeTabId === intent.id ? (nextTabs[0]?.id ?? null) : vm.projects.activeTabId;
          return { vm: { ...vm, projects: { openTabs: nextTabs, activeTabId: nextActive } } };
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
          return { vm };
        case 'SHORTCUT_FIND':
          return { vm };
        default:
          return { vm };
      }
    });
  }
}));
