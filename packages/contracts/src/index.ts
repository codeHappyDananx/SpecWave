export type RightMode = "terminal" | "chat";

// Story 阶段枚举
export type StoryPhase =
  | 'appeal'      // 诉求对齐
  | 'requirement' // 需求编写
  | 'design'      // 设计方案
  | 'task'        // 任务拆解
  | 'executing'   // 执行中
  | 'completed';  // 已完成

// Story 卡片数据
export type StoryCardVM = {
  id: string;           // Story 目录名，如 "STORY-000001(概要)"
  title: string;        // 从目录名提取的标题
  phase: StoryPhase;    // 当前阶段
  createdAt: string;    // 创建时间（目录 mtime）
  taskProgress: {       // 任务进度
    completed: number;
    total: number;
  } | null;
  path: string;         // 完整路径
};

// 看板视图数据
export type StoryBoardVM = {
  isLoading: boolean;
  stories: StoryCardVM[];
  error: string | null;
};

// 阶段指示器数据
export type PhaseIndicatorVM = {
  visible: boolean;           // 是否显示
  storyId: string | null;     // 当前 Story ID
  currentPhase: StoryPhase;   // 当前阶段
  availablePhases: {          // 各阶段可用性
    phase: StoryPhase;
    enabled: boolean;         // 文档是否存在
    filePath: string | null;  // 对应文件路径
  }[];
};

// 左区视图模式
export type LeftViewMode = 'explorer' | 'storyBoard';

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

export type ContentKind = "markdown" | "task" | "text" | "image" | "binary";
export type ContentMode = "view" | "editor" | "task";

export type ContentFileVM = {
  path: string;
  name: string;
  kind: ContentKind;
  sha256: string;
};

export type TaskSourceVM = {
  statusPos: number;
  titleStartPos: number;
  titleEndPos: number;
  blockStartPos: number;
  blockEndPos: number;
};

export type TaskItemVM = {
  id: string;
  title: string;
  summary: string;
  body: string;
  checked: boolean;
  level: number;
  source: TaskSourceVM;
  // 新增：关联引用列表
  linkedRefs: string[];  // ['REQ-001', 'AC-001', 'AC-002']
};

export type TaskDetailVM = {
  isOpen: boolean;
  mode: "view" | "edit";
  draftTitle: string;
  draftBody: string;
};

// 新增：关联文档数据结构
export type LinkedDocVM = {
  refId: string;           // 'REQ-001' | 'AC-001'
  type: 'req' | 'ac';      // 需求 | 验收口径
  title: string;           // 需求标题
  content: string;         // 完整内容（markdown）
  sourceFile: string;      // '01-需求.md'
  lineNumber: number;      // 用于跳转定位
};

export type TaskBoardVM = {
  items: TaskItemVM[];
  activeTaskId: string | null;
  deckMode: 'single' | 'all';
  detail: TaskDetailVM;
  // 新增：当前任务的关联文档
  linkedDocs: LinkedDocVM[];
  linkedDocsLoading: boolean;
  linkedDocsError: string | null;
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
  | { type: "LEFT_VIEW_MODE_SET"; mode: LeftViewMode }
  | { type: "STORY_BOARD_LOAD" }
  | { type: "STORY_BOARD_REFRESH" }
  | { type: "STORY_CARD_CLICK"; storyId: string }
  | { type: "PHASE_INDICATOR_CLICK"; phase: StoryPhase }
  | { type: "RIGHT_PANEL_ADD" }
  | { type: "PROJECT_TAB_ADD_EMPTY" }
  | { type: "PROJECT_SELECT" }
  | { type: "PROJECT_OPEN_RECENT"; path: string }
  | { type: "RECENT_PROJECT_REMOVE"; path: string }
  | { type: "PROJECT_TAB_SET_ACTIVE"; id: string }
  | { type: "PROJECT_TAB_CLOSE"; id: string }
  | { type: "EXPLORER_TOGGLE_DIR"; tree: ExplorerTree; id: string }
  | { type: "EXPLORER_OPEN_FILE"; path: string }
  | { type: "EXPLORER_REVEAL_IN_OS"; path: string }
  | { type: "EXPLORER_SHOW_IGNORED_SET"; showIgnored: boolean }
  | { type: "CONTENT_TOGGLE_VIEW_MODE" }
  | { type: "CONTENT_DRAFT_SET"; text: string }
  | { type: "CONTENT_SAVE_REQUEST" }
  | { type: "CONTENT_FIND_SET_QUERY"; query: string }
  | { type: "CONTENT_FIND_NEXT" }
  | { type: "CONTENT_FIND_PREV" }
  | { type: "CONTENT_FIND_CLOSE" }
  | { type: "TASK_ITEM_TOGGLE"; taskId: string; source: TaskSourceVM }
  | { type: "TASK_ITEM_OPEN"; taskId: string }
  | { type: "TASK_DETAIL_OPEN"; taskId: string; mode: TaskDetailVM["mode"] }
  | { type: "TASK_DETAIL_CLOSE" }
  | { type: "TASK_DETAIL_MODE_SET"; mode: TaskDetailVM["mode"] }
  | { type: "TASK_DETAIL_DRAFT_SET"; title?: string; body?: string }
  | { type: "TASK_DETAIL_SAVE" }
  | { type: "TASK_ITEM_START"; taskId: string }
  | { type: "TASK_DECK_MODE_SET"; mode: TaskBoardVM["deckMode"] }
  | { type: "TASK_DECK_PREV" }
  | { type: "TASK_DECK_NEXT" }
  | { type: "TASK_DECK_FOCUS"; taskId: string }
  | { type: "TASK_LINKED_DOC_JUMP"; refId: string; sourceFile: string; lineNumber: number }
  | { type: "TASK_LINKED_DOCS_TOGGLE_SECTION"; section: 'req' | 'ac' }
  | { type: "THEME_TOGGLE" }
  | { type: "SKIN_CYCLE" }
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
  leftViewMode: LeftViewMode;
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

  ui: { theme: "light" | "dark"; skin: "blue" | "purple" | "green" | "amber" };

  panelMinW: {
    leftPx: number;
    centerPx: number;
    rightPx: number;
  };

  layout: LayoutVM;

  storyBoard: StoryBoardVM;
  phaseIndicator: PhaseIndicatorVM;
};
