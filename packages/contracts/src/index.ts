export type RightMode = "terminal" | "chat";

export type ProjectTabVM = {
  id: string;
  folderName: string;
};

export type CenterMode = "work" | "tasks";

export type LayoutVM = {
  containerWidthPx: number;
  isDragging: boolean;
  leftPx: number;
  centerPx: number;
  rightPx: number;
};

export type UIIntent =
  | { type: "PANEL_TOGGLE_LEFT" }
  | { type: "PANEL_TOGGLE_CENTER" }
  | { type: "PANEL_TOGGLE_RIGHT" }
  | { type: "RIGHT_MODE_SET"; mode: RightMode }
  | { type: "RIGHT_PANEL_ADD" }
  | { type: "CENTER_MODE_SET"; mode: CenterMode }
  | { type: "PROJECT_OPEN_MOCK" }
  | { type: "PROJECT_TAB_SET_ACTIVE"; id: string }
  | { type: "PROJECT_TAB_CLOSE"; id: string }
  | { type: "THEME_TOGGLE" }
  | { type: "TERMINAL_PANEL_CLOSE"; id: string }
  | { type: "TERMINAL_PANEL_SET_ACTIVE"; id: string }
  | { type: "CHAT_SESSION_CLOSE"; id: string }
  | { type: "CHAT_SESSION_SET_ACTIVE"; id: string }
  | { type: "GLOBAL_SEARCH_SET"; query: string }
  | { type: "TERMINAL_COMMAND_SUBMIT"; command: string }
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
  projects: {
    openTabs: ProjectTabVM[];
    activeTabId: string | null;
  };

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

  ui: {
    centerMode: CenterMode;
    theme: "light";
  };

  layout: LayoutVM;
};
