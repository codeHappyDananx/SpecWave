// 树节点
export interface TreeNode {
  id: string
  name: string
  type: 'folder' | 'file'
  path: string
  children?: TreeNode[]
  childrenLoaded?: boolean
  isExpanded?: boolean
  isArchived?: boolean
  progress?: { completed: number; total: number }
  fileType?: string
  displayName?: string
}

// 文件内容
export interface FileContent {
  path: string
  name: string
  content: string
  type: 'markdown' | 'task' | 'code' | 'image' | 'other'
  fileType?: string
  isImage?: boolean
}

// 任务项
export interface TaskItem {
  id: string
  label: string
  checked: boolean
  level: number
  children?: TaskItem[]
  requirements?: string[] // 关联的需求引用
  description?: string // 任务描述
  section?: string // 所属章节标题
  isSection?: boolean // 是否为章节标题
}

// 用户偏好
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  sidebarWidth: number
  terminalWidth: number
  terminalOpen: boolean
  sidebarCollapsed?: boolean
  contentCollapsed?: boolean
  terminalCollapsed?: boolean
  windowBounds: { x?: number; y?: number; width: number; height: number }
  recentProjects: string[]
}

export interface TerminalAppearance {
  theme?: {
    background?: string
    foreground?: string
    cursor?: string
    cursorAccent?: string
    selectionBackground?: string
    black?: string
    red?: string
    green?: string
    yellow?: string
    blue?: string
    magenta?: string
    cyan?: string
    white?: string
    brightBlack?: string
    brightRed?: string
    brightGreen?: string
    brightYellow?: string
    brightBlue?: string
    brightMagenta?: string
    brightCyan?: string
    brightWhite?: string
  }
  fontFamily?: string
  fontSize?: number
  cursorBlink?: boolean
  cursorStyle?: 'block' | 'underline' | 'bar'
  allowTransparency?: boolean
  drawBoldTextInBrightColors?: boolean
}

export interface PerfLogPayload {
  event: string
  source?: 'renderer' | 'main'
  durationMs?: number
  [key: string]: unknown
}

// Electron API 类型
declare global {
  interface Window {
    electronAPI?: {
      // 文件系统
      selectDirectory: () => Promise<{ success: boolean; path?: string; error?: string; isOpenSpec?: boolean }>
      readDirectory: (dirPath: string) => Promise<{ success: boolean; items?: TreeNode[]; error?: string }>
      readDirectoryDepth: (dirPath: string, maxDepth: number) => Promise<{ success: boolean; items?: TreeNode[]; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string; fileType?: string; isImage?: boolean }>
      saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      watchDirectory: (payload: { key: string; dirPath: string } | string) => Promise<{ success: boolean; error?: string }>
      unwatchDirectory: (key: string) => Promise<{ success: boolean; error?: string }>
      
      // 事件监听
      onFileChanged: (callback: (data: { key?: string; type: string; path: string }) => void) => () => void

      onMenuNewTab: (callback: () => void) => () => void
      onMenuCloseTab: (callback: () => void) => () => void
      onMenuOpenRecent: (callback: (projectPath: string) => void) => () => void
      
      // 终端
      terminalStart: (options: { cwd?: string; shell?: string } | string) => Promise<{ success: boolean; sessionId?: number; error?: string }>
      terminalWrite: (payload: { sessionId: number; data: string }) => Promise<{ success: boolean; error?: string }>
      terminalResize: (payload: { sessionId: number; cols: number; rows: number }) => Promise<{ success: boolean; error?: string }>
      terminalStop: (sessionId?: number) => Promise<{ success: boolean; error?: string }>
      terminalPasteImage: (options: { cwd?: string; prefix?: string }) => Promise<{ success: boolean; fileName?: string; filePath?: string; error?: string }>
      getTerminalAppearance: (shell?: 'powershell' | 'cmd') => Promise<TerminalAppearance | null>
      onTerminalData: (callback: (payload: { sessionId: number; data: string }) => void) => () => void
      onTerminalExit: (callback: (payload: { sessionId: number; exitCode: number }) => void) => () => void
      perfEnabled: boolean
      perfLog: (payload: PerfLogPayload) => Promise<{ success: boolean; error?: string }>
      
      // 剪贴板
      clipboardReadText: () => string
      clipboardWriteText: (text: string) => void

      // 偏好设置
      getPreferences: () => Promise<UserPreferences>
      setPreferences: (prefs: Partial<UserPreferences>) => Promise<{ success: boolean }>
      getRecentProjects: () => Promise<string[]>
    }
  }
}

export {}
