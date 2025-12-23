const { contextBridge, ipcRenderer, clipboard } = require('electron')

const perfEnabled = process.env.OPENSPEC_PERF_LOG === '1'

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readDirectoryDepth: (dirPath, maxDepth) => ipcRenderer.invoke('read-directory-depth', { dirPath, maxDepth }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  watchDirectory: (dirPath) => ipcRenderer.invoke('watch-directory', dirPath),
  
  // 文件变化监听
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', (event, data) => callback(data))
  },
  
  // 终端操作
  terminalStart: (options) => ipcRenderer.invoke('terminal-start', options),
  terminalWrite: (payload) => ipcRenderer.invoke('terminal-write', payload),
  terminalResize: (payload) => ipcRenderer.invoke('terminal-resize', payload),
  terminalStop: (sessionId) => ipcRenderer.invoke('terminal-stop', sessionId),
  terminalPasteImage: (options) => ipcRenderer.invoke('terminal-paste-image', options),
  getTerminalAppearance: (shell) => ipcRenderer.invoke('get-terminal-appearance', shell),
  onTerminalData: (callback) => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.removeListener('terminal-data', listener)
  },
  onTerminalExit: (callback) => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.removeListener('terminal-exit', listener)
  },

  perfEnabled,
  perfLog: (payload) => ipcRenderer.invoke('perf-log', payload),

  // 剪贴板
  clipboardReadText: () => clipboard.readText(),
  clipboardWriteText: (text) => clipboard.writeText(text || ''),
  
  // 偏好设置
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  setPreferences: (prefs) => ipcRenderer.invoke('set-preferences', prefs),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects')
})
