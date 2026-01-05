export type RightMode = "terminal" | "chat";

export type ProjectTabVM = {
  id: string;
  folderName: string;
  // `null` 表示“空项目页签”：已占位但尚未选择目录。
  path: string | null;
};

export type RecentProjectVM = {
  path: string;
  name: string;
  lastOpenedAt: number;
  exists: boolean;
};

export type AppMode = "welcome" | "main";

export type LayoutVM = {
  containerWidthPx: number;
  isDragging: boolean;
  leftPx: number;
  centerPx: number;
  rightPx: number;
};

export type ExplorerTree = "workspace" | "project";

export type ExplorerNodeVM = {
  id: string;
  name: string;
  kind: "dir" | "file";
  // 是否属于“默认忽略项”（由 store 统一打标；UI 只按开关决定显隐）。
  isIgnored?: boolean;
  children?: ExplorerNodeVM[];
  isLoading?: boolean;
  error?: string;
};

export type ExplorerVM = {
  workspaceRoot: string | null;
  projectRoot: string | null;
  workspace: ExplorerNodeVM[];
  project: ExplorerNodeVM[];
  expanded: {
    workspace: string[];
    project: string[];
  };
  selectedPath: string | null;
  showIgnored: boolean;
  isLoading: boolean;
  error: string | null;
};

export type ContentKind = "markdown" | "task" | "text";
export type ContentMode = "view" | "editor" | "task";

export type ContentFileVM = {
  path: string;
  name: string;
  kind: ContentKind;
  sha256: string;
};

export type TaskSourceVM = {
  statusPos: number;
};

export type TaskItemVM = {
  id: string;
  label: string;
  checked: boolean;
  level: number;
  source: TaskSourceVM;
};

export type TaskBoardVM = {
  items: TaskItemVM[];
};

export type ContentFindVM = {
  isOpen: boolean;
  query: string;
  matchStarts: number[];
  activeIndex: number;
};

export type ContentVM = {
  file: ContentFileVM | null;
  text: string;
  draftText: string;
  mode: ContentMode;
  isDirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error" | "conflict";
  saveError: string | null;
  taskBoard: TaskBoardVM | null;
  find: ContentFindVM;
};

export type UIIntent =
  | { type: "APP_QUIT_REQUEST" }
  | { type: "PANEL_TOGGLE_LEFT" }
  | { type: "PANEL_TOGGLE_CENTER" }
  | { type: "PANEL_TOGGLE_RIGHT" }
  | { type: "RIGHT_MODE_SET"; mode: RightMode }
  | { type: "RIGHT_PANEL_ADD" }
  | { type: "PROJECT_TAB_ADD_EMPTY" }
  | { type: "PROJECT_SELECT" }
  | { type: "PROJECT_OPEN_RECENT"; path: string }
  | { type: "RECENT_PROJECT_REMOVE"; path: string }
  | { type: "PROJECT_TAB_SET_ACTIVE"; id: string }
  | { type: "PROJECT_TAB_CLOSE"; id: string }
  | { type: "EXPLORER_TOGGLE_DIR"; tree: ExplorerTree; id: string }
  | { type: "EXPLORER_OPEN_FILE"; path: string }
  | { type: "EXPLORER_SHOW_IGNORED_SET"; showIgnored: boolean }
  | { type: "CONTENT_TOGGLE_VIEW_MODE" }
  | { type: "CONTENT_DRAFT_SET"; text: string }
  | { type: "CONTENT_SAVE_REQUEST" }
  | { type: "CONTENT_FIND_SET_QUERY"; query: string }
  | { type: "CONTENT_FIND_NEXT" }
  | { type: "CONTENT_FIND_PREV" }
  | { type: "CONTENT_FIND_CLOSE" }
  | { type: "TASK_ITEM_TOGGLE"; taskId: string; source: TaskSourceVM }
  | { type: "THEME_TOGGLE" }
  | { type: "TERMINAL_PANEL_CLOSE"; id: string }
  | { type: "TERMINAL_PANEL_SET_ACTIVE"; id: string }
  | { type: "TERMINAL_COPY"; text: string }
  | { type: "TERMINAL_PASTE"; id: string }
  | { type: "CHAT_SESSION_CLOSE"; id: string }
  | { type: "CHAT_SESSION_SET_ACTIVE"; id: string }
  | { type: "GLOBAL_SEARCH_SET"; query: string }
  | { type: "TERMINAL_WRITE"; id: string; data: string }
  | { type: "TERMINAL_RESIZE"; id: string; cols: number; rows: number }
  | { type: "CHAT_DRAFT_SET"; id: string; text: string }
  | { type: "CHAT_MESSAGE_SUBMIT"; id: string; text: string }
  | { type: "LAYOUT_CONTAINER_SET"; widthPx: number }
  | { type: "LAYOUT_DRAG_START"; handle: "L" | "R" }
  | { type: "LAYOUT_DRAG_MOVE"; deltaX: number }
  | { type: "LAYOUT_DRAG_END" }
  | { type: "SHORTCUT_SAVE" }
  | { type: "SHORTCUT_FIND" };

export type ChatMessageVM = {
  who: "你" | "AI";
  text: string;
};

export type AppViewModel = {
  app: {
    mode: AppMode;
    recentProjects: RecentProjectVM[];
  };

  projects: {
    openTabs: ProjectTabVM[];
    activeTabId: string | null;
  };

  explorer: ExplorerVM;
  content: ContentVM;

  leftVisible: boolean;
  centerVisible: boolean;
  rightVisible: boolean;
  rightMode: RightMode;

  globalSearchQuery: string;

  terminal: {
    panelIds: string[];
    activePanelId: string;
    outputByPanel: Record<string, string[]>;
  };

  chat: {
    sessionIds: string[];
    activeSessionId: string;
    messagesBySession: Record<string, ChatMessageVM[]>;
    draftBySession: Record<string, string>;
  };

  ui: { theme: "light"; skin: "blue" | "purple" | "green" | "amber" };

  panelMinW: {
    leftPx: number;
    centerPx: number;
    rightPx: number;
  };

  layout: LayoutVM;
};
