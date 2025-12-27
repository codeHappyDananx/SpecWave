const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const chokidar = require('chokidar')
const { spawnSync } = require('child_process')

const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const IS_WINDOWS = process.platform === 'win32'

let pty = null
try {
  pty = require('node-pty')
} catch (err) {
  console.error('[Terminal] node-pty not available:', err.message)
}

let mainWindow = null
let fileWatchers = new Map()
let ptySessions = new Map()
let ptySessionId = 0
let userPreferences = {
  theme: 'system',
  markdownLineNumbers: true,
  sidebarWidth: 250,
  terminalWidth: 350,
  sidebarCollapsed: false,
  contentCollapsed: false,
  terminalCollapsed: false,
  windowBounds: { x: undefined, y: undefined, width: 1400, height: 900 },
  recentProjects: [],
  terminalOpen: false
}

// 偏好设置文件路径
const prefsPath = path.join(app.getPath('userData'), 'preferences.json')

const perfLogEnabled = process.env.OPENSPEC_PERF_LOG === '1'
let perfLogStream = null

function getPerfLogStream() {
  if (!perfLogEnabled) return null
  if (perfLogStream) return perfLogStream
  try {
    const logDir = path.join(app.getPath('userData'), 'perf-logs')
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'perf.jsonl')
    perfLogStream = fs.createWriteStream(logPath, { flags: 'a' })
    perfLogStream.on('error', (err) => {
      console.error('[Perf] stream error:', err.message)
    })
  } catch (err) {
    console.error('[Perf] init failed:', err.message)
  }
  return perfLogStream
}

function logPerf(event, data = {}) {
  if (!perfLogEnabled) return
  try {
    const stream = getPerfLogStream()
    if (!stream) return
    const entry = { ts: Date.now(), event, source: 'main', ...data }
    stream.write(`${JSON.stringify(entry)}\n`)
  } catch (err) {
    console.error('[Perf] log failed:', err.message)
  }
}

function stripJsonComments(input) {
  let output = ''
  let inString = false
  let stringChar = ''
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]

    if (inString) {
      output += ch
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\\\') {
        escaped = true
        continue
      }
      if (ch === stringChar) {
        inString = false
        stringChar = ''
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      output += ch
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < input.length && input[i] !== '\\n') {
        i += 1
      }
      output += '\\n'
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i += 1
      }
      i += 1
      continue
    }

    output += ch
  }

  return output
}

function removeTrailingCommas(input) {
  return input.replace(/,\\s*([}\\]])/g, '$1')
}

const BUILTIN_SCHEMES = {
  'Campbell': {
    foreground: '#CCCCCC',
    background: '#0C0C0C',
    cursorColor: '#FFFFFF',
    black: '#0C0C0C',
    red: '#C50F1F',
    green: '#13A10E',
    yellow: '#C19C00',
    blue: '#0037DA',
    purple: '#881798',
    cyan: '#3A96DD',
    white: '#CCCCCC',
    brightBlack: '#767676',
    brightRed: '#E74856',
    brightGreen: '#16C60C',
    brightYellow: '#F9F1A5',
    brightBlue: '#3B78FF',
    brightPurple: '#B4009E',
    brightCyan: '#61D6D6',
    brightWhite: '#F2F2F2'
  },
  'Campbell Powershell': {
    foreground: '#CCCCCC',
    background: '#012456',
    cursorColor: '#FFFFFF',
    black: '#0C0C0C',
    red: '#C50F1F',
    green: '#13A10E',
    yellow: '#C19C00',
    blue: '#0037DA',
    purple: '#881798',
    cyan: '#3A96DD',
    white: '#CCCCCC',
    brightBlack: '#767676',
    brightRed: '#E74856',
    brightGreen: '#16C60C',
    brightYellow: '#F9F1A5',
    brightBlue: '#3B78FF',
    brightPurple: '#B4009E',
    brightCyan: '#61D6D6',
    brightWhite: '#F2F2F2'
  },
  'Campbell PowerShell': {
    foreground: '#CCCCCC',
    background: '#012456',
    cursorColor: '#FFFFFF',
    black: '#0C0C0C',
    red: '#C50F1F',
    green: '#13A10E',
    yellow: '#C19C00',
    blue: '#0037DA',
    purple: '#881798',
    cyan: '#3A96DD',
    white: '#CCCCCC',
    brightBlack: '#767676',
    brightRed: '#E74856',
    brightGreen: '#16C60C',
    brightYellow: '#F9F1A5',
    brightBlue: '#3B78FF',
    brightPurple: '#B4009E',
    brightCyan: '#61D6D6',
    brightWhite: '#F2F2F2'
  }
}

function getWindowsTerminalSettingsPaths() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return []
  return [
    path.join(localAppData, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(localAppData, 'Packages', 'Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
    path.join(localAppData, 'Microsoft', 'Windows Terminal', 'settings.json'),
    path.join(localAppData, 'Microsoft', 'Windows Terminal Preview', 'settings.json')
  ]
}

function readWindowsTerminalSettings() {
  const paths = getWindowsTerminalSettingsPaths()
  for (const candidate of paths) {
    try {
      if (!fs.existsSync(candidate)) continue
      const raw = fs.readFileSync(candidate, 'utf-8')
      const cleaned = removeTrailingCommas(stripJsonComments(raw.replace(/^\uFEFF/, '')))
      console.log('[Terminal] settings loaded', candidate)
      return { settings: JSON.parse(cleaned), path: candidate }
    } catch (err) {
      console.warn('[Terminal] Failed to parse settings:', candidate, err.message)
    }
  }
  return null
}

function pickProfileForShell(settings, shell) {
  const profiles = settings?.profiles || {}
  const list = Array.isArray(profiles.list) ? profiles.list : []
  if (!list.length) return null

  if (shell) {
    const normalizedShell = String(shell).toLowerCase()
    const matcher = normalizedShell === 'cmd'
      ? (p) => /cmd(\\.exe)?/i.test(p.commandline || '') || /command prompt|cmd/i.test(p.name || '')
      : (p) => /powershell|pwsh/i.test(p.commandline || '') || /powershell/i.test(p.name || '')
    const match = list.find(matcher)
    if (match) return match
  }

  const defaultProfile = settings?.defaultProfile
  if (defaultProfile) {
    const match = list.find(p => p.guid === defaultProfile)
    if (match) return match
  }

  return list[0]
}

function resolveFontSettings(profile, defaults) {
  const merged = { ...(defaults || {}), ...(profile || {}) }
  const defaultFont = (defaults && defaults.font) || {}
  const profileFont = (profile && profile.font) || {}
  const fontBlock = { ...defaultFont, ...profileFont }
  const fontFamily = fontBlock.face || merged.fontFace || null
  const fontSizeRaw = fontBlock.size || merged.fontSize
  const fontSize = Number.isFinite(fontSizeRaw) ? fontSizeRaw : Number(fontSizeRaw)
  return {
    fontFamily: typeof fontFamily === 'string' && fontFamily.trim() ? fontFamily.trim() : null,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : null
  }
}

function normalizeOpacity(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  if (num <= 1) return Math.max(0, num)
  return Math.max(0, Math.min(num / 100, 1))
}

function applyOpacityToHex(color, opacity) {
  if (typeof color !== 'string' || opacity === null || opacity === undefined) return color
  const value = color.trim()
  if (!value.startsWith('#')) return color
  const hex = value.slice(1)
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return color
}

function resolveCursorSettings(profile, defaults) {
  const merged = { ...(defaults || {}), ...(profile || {}) }
  const cursorBlink = typeof merged.cursorBlink === 'boolean' ? merged.cursorBlink : null
  const cursorShape = typeof merged.cursorShape === 'string' ? merged.cursorShape.toLowerCase() : ''
  let cursorStyle = null
  if (cursorShape === 'bar') cursorStyle = 'bar'
  if (cursorShape === 'underscore') cursorStyle = 'underline'
  if (cursorShape === 'vintage' || cursorShape === 'filledbox' || cursorShape === 'emptybox') {
    cursorStyle = 'block'
  }
  const useAcrylic = merged.useAcrylic === true
  const opacity = useAcrylic ? normalizeOpacity(merged.opacity) : null
  const allowTransparency = useAcrylic && opacity !== null && opacity < 1
  return { cursorBlink, cursorStyle, allowTransparency, opacity, useAcrylic }
}

function resolveTextStyleSettings(profile, defaults) {
  const merged = { ...(defaults || {}), ...(profile || {}) }
  const intense = typeof merged.intenseTextStyle === 'string' ? merged.intenseTextStyle.toLowerCase() : ''
  let drawBoldTextInBrightColors = null
  if (intense === 'bold') drawBoldTextInBrightColors = false
  if (intense === 'bright' || intense === 'all') drawBoldTextInBrightColors = true
  return { drawBoldTextInBrightColors }
}

function findSchemeByName(schemes, name) {
  if (!Array.isArray(schemes) || !name) return null
  const target = String(name).toLowerCase()
  return schemes.find(s => String(s.name || '').toLowerCase() === target) || null
}

function resolveColorScheme(settings, profile, defaults, shell, opacity) {
  const merged = { ...(defaults || {}), ...(profile || {}) }
  const schemes = settings?.schemes || settings?.colorSchemes || []
  let schemeName = merged.colorScheme
  if (schemeName && typeof schemeName === 'object') {
    const darkName = schemeName.dark
    const lightName = schemeName.light
    schemeName = darkName || lightName
  }
  let scheme = findSchemeByName(schemes, schemeName)
  if (!scheme && schemeName && BUILTIN_SCHEMES[schemeName]) {
    scheme = BUILTIN_SCHEMES[schemeName]
  }
  if (!scheme) {
    const profileName = (profile?.name || '').toLowerCase()
    const shellName = String(shell || '').toLowerCase()
    const prefer = []
    if (profileName.includes('powershell') || shellName === 'powershell') {
      prefer.push('Campbell Powershell', 'Campbell PowerShell', 'Campbell')
    }
    if (profileName.includes('cmd') || profileName.includes('command prompt') || shellName === 'cmd') {
      prefer.push('Campbell', 'Vintage')
    }
    if (!prefer.length) {
      prefer.push('Campbell', 'Campbell Powershell', 'Vintage')
    }
    scheme = prefer
      .map(name => BUILTIN_SCHEMES[name] || findSchemeByName(schemes, name))
      .find(Boolean) || null
    if (!scheme && Array.isArray(schemes) && schemes.length) {
      scheme = schemes[0]
    }
  }

  const theme = {
    background: merged.background || scheme?.background,
    foreground: merged.foreground || scheme?.foreground,
    cursor: merged.cursorColor || scheme?.cursorColor,
    selectionBackground: merged.selectionBackground || scheme?.selectionBackground,
    black: scheme?.black,
    red: scheme?.red,
    green: scheme?.green,
    yellow: scheme?.yellow,
    blue: scheme?.blue,
    magenta: scheme?.purple || scheme?.magenta,
    cyan: scheme?.cyan,
    white: scheme?.white,
    brightBlack: scheme?.brightBlack,
    brightRed: scheme?.brightRed,
    brightGreen: scheme?.brightGreen,
    brightYellow: scheme?.brightYellow,
    brightBlue: scheme?.brightBlue,
    brightMagenta: scheme?.brightPurple || scheme?.brightMagenta,
    brightCyan: scheme?.brightCyan,
    brightWhite: scheme?.brightWhite
  }

  const compact = {}
  for (const [key, value] of Object.entries(theme)) {
    if (typeof value === 'string' && value.trim()) {
      compact[key] = value.trim()
    }
  }
  if (compact.background && opacity !== null && opacity < 1) {
    compact.background = applyOpacityToHex(compact.background, opacity)
  }
  return compact
}

function getTerminalAppearance(shell) {
  const result = readWindowsTerminalSettings()
  if (!result || !result.settings) {
    const fallbackTheme = resolveFallbackTheme(shell)
    console.log('[Terminal] appearance fallback', { shell, source: 'builtin' })
    return fallbackTheme ? { theme: fallbackTheme } : null
  }

  const settings = result.settings
  const profiles = settings.profiles || {}
  const defaults = profiles.defaults || {}
  const profile = pickProfileForShell(settings, shell)

  const cursorSettings = resolveCursorSettings(profile, defaults)
  const textStyleSettings = resolveTextStyleSettings(profile, defaults)
  const opacity = cursorSettings.allowTransparency ? cursorSettings.opacity : null
  const theme = resolveColorScheme(settings, profile, defaults, shell, opacity)
  const fontSettings = resolveFontSettings(profile, defaults)

  if (!Object.keys(theme).length) {
    const fallbackTheme = resolveFallbackTheme(shell)
    if (fallbackTheme) {
      theme.background = fallbackTheme.background
      theme.foreground = fallbackTheme.foreground
      theme.cursor = fallbackTheme.cursorColor
      theme.selectionBackground = fallbackTheme.selectionBackground
      theme.black = fallbackTheme.black
      theme.red = fallbackTheme.red
      theme.green = fallbackTheme.green
      theme.yellow = fallbackTheme.yellow
      theme.blue = fallbackTheme.blue
      theme.magenta = fallbackTheme.purple || fallbackTheme.magenta
      theme.cyan = fallbackTheme.cyan
      theme.white = fallbackTheme.white
      theme.brightBlack = fallbackTheme.brightBlack
      theme.brightRed = fallbackTheme.brightRed
      theme.brightGreen = fallbackTheme.brightGreen
      theme.brightYellow = fallbackTheme.brightYellow
      theme.brightBlue = fallbackTheme.brightBlue
      theme.brightMagenta = fallbackTheme.brightPurple || fallbackTheme.brightMagenta
      theme.brightCyan = fallbackTheme.brightCyan
      theme.brightWhite = fallbackTheme.brightWhite
      console.log('[Terminal] appearance fallback', { shell, source: 'builtin', profile: profile?.name })
    }
  }

  if (!Object.keys(theme).length && !fontSettings.fontFamily && !fontSettings.fontSize) {
    return null
  }

  console.log('[Terminal] appearance resolved', {
    shell,
    profile: profile?.name,
    theme,
    fontFamily: fontSettings.fontFamily,
    fontSize: fontSettings.fontSize,
    cursorBlink: cursorSettings.cursorBlink,
    cursorStyle: cursorSettings.cursorStyle,
    allowTransparency: cursorSettings.allowTransparency,
    opacity: cursorSettings.opacity,
    useAcrylic: cursorSettings.useAcrylic,
    drawBoldTextInBrightColors: textStyleSettings.drawBoldTextInBrightColors
  })

  return {
    theme: Object.keys(theme).length ? theme : undefined,
    fontFamily: fontSettings.fontFamily || undefined,
    fontSize: fontSettings.fontSize || undefined,
    cursorBlink: typeof cursorSettings.cursorBlink === 'boolean' ? cursorSettings.cursorBlink : undefined,
    cursorStyle: cursorSettings.cursorStyle || undefined,
    allowTransparency: typeof cursorSettings.allowTransparency === 'boolean'
      ? cursorSettings.allowTransparency
      : undefined,
    drawBoldTextInBrightColors: typeof textStyleSettings.drawBoldTextInBrightColors === 'boolean'
      ? textStyleSettings.drawBoldTextInBrightColors
      : undefined
  }
}

function resolveFallbackTheme(shell) {
  const value = String(shell || '').toLowerCase()
  if (value === 'cmd' || value === 'cmd.exe') {
    return BUILTIN_SCHEMES['Campbell']
  }
  return BUILTIN_SCHEMES['Campbell PowerShell'] || BUILTIN_SCHEMES['Campbell Powershell']
}

// 加载用户偏好
function loadPreferences() {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf-8')
      userPreferences = { ...userPreferences, ...JSON.parse(data) }
    }
  } catch (err) {
    console.error('Failed to load preferences:', err)
  }
}

// 保存用户偏好
function savePreferences() {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify(userPreferences, null, 2))
  } catch (err) {
    console.error('Failed to save preferences:', err)
  }
}

function getRecentProjectsForMenu() {
  try {
    return userPreferences.recentProjects.filter(p => fs.existsSync(p)).slice(0, 10)
  } catch {
    return []
  }
}

function sendMenuEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    if (payload === undefined) {
      mainWindow.webContents.send(channel)
      return
    }
    mainWindow.webContents.send(channel, payload)
  } catch (err) {
    console.warn('[Menu] send failed:', err.message)
  }
}

function buildApplicationMenuTemplate() {
  const recentProjects = getRecentProjectsForMenu()
  const recentItems = recentProjects.length > 0
    ? recentProjects.map((projectPath) => ({
      label: path.basename(projectPath) || projectPath,
      click: () => sendMenuEvent('menu-open-recent', projectPath)
    }))
    : [{ label: '（暂无最近项目）', enabled: false }]

  return [
    {
      label: '项目',
      submenu: [
        { label: '新建页签', accelerator: 'Ctrl+T', click: () => sendMenuEvent('menu-new-tab') },
        { label: '关闭页签', accelerator: 'Ctrl+W', click: () => sendMenuEvent('menu-close-tab') },
        { type: 'separator' },
        { label: '打开最近', submenu: recentItems },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    }
  ]
}

function refreshApplicationMenu() {
  try {
    const template = buildApplicationMenuTemplate()
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  } catch (err) {
    console.warn('[Menu] build failed:', err.message)
  }
}

function createWindow() {
  loadPreferences()
  
  const { windowBounds } = userPreferences
  
  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  // 开发模式加载 Vite 服务器，生产模式加载打包文件
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 保存窗口位置和大小
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds()
    userPreferences.windowBounds = bounds
    savePreferences()
  })

  refreshApplicationMenu()
}

// 验证是否为有效的 OpenSpec 项目
function isValidOpenSpecProject(dirPath) {
  const changesPath = path.join(dirPath, 'changes')
  const specsPath = path.join(dirPath, 'specs')
  return fs.existsSync(changesPath) || fs.existsSync(specsPath)
}

// 获取文件类型
function getFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase()
  const typeMap = {
    '.md': 'markdown',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.vue': 'vue',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.xml': 'xml',
    '.py': 'python',
    '.java': 'java',
    '.sh': 'bash',
    '.bat': 'batch',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.txt': 'text',
    '.log': 'text',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.ico': 'image'
  }
  return typeMap[ext] || 'text'
}

function detectTextMeta(buffer) {
  if (!buffer || buffer.length === 0) {
    return { encoding: 'utf8', bom: 'none', bomLength: 0 }
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf8', bom: 'utf8', bomLength: 3 }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf16le', bom: 'utf16le', bomLength: 2 }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf16be', bom: 'utf16be', bomLength: 2 }
  }
  return { encoding: 'utf8', bom: 'none', bomLength: 0 }
}

function decodeTextBuffer(buffer) {
  const meta = detectTextMeta(buffer)
  const body = buffer.slice(meta.bomLength)
  if (meta.encoding === 'utf16le') {
    return { text: body.toString('utf16le'), meta }
  }
  if (meta.encoding === 'utf16be') {
    const swapped = Buffer.from(body)
    if (swapped.length >= 2) swapped.swap16()
    return { text: swapped.toString('utf16le'), meta }
  }
  return { text: body.toString('utf8'), meta }
}

function detectEol(text) {
  if (typeof text !== 'string' || text.length === 0) return '\n'
  return text.indexOf('\r\n') >= 0 ? '\r\n' : '\n'
}

function normalizeEol(text, eol) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (eol === '\r\n') return normalized.replace(/\n/g, '\r\n')
  return normalized
}

function encodeTextBuffer(text, options) {
  const encoding = options?.encoding || 'utf8'
  const bom = options?.bom || 'none'
  const eol = options?.eol || '\n'
  const normalizedText = normalizeEol(text, eol)

  if (encoding === 'utf16le') {
    const body = Buffer.from(normalizedText, 'utf16le')
    if (bom === 'utf16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), body])
    return body
  }

  if (encoding === 'utf16be') {
    const body = Buffer.from(normalizedText, 'utf16le')
    if (body.length >= 2) body.swap16()
    if (bom === 'utf16be') return Buffer.concat([Buffer.from([0xfe, 0xff]), body])
    return body
  }

  const body = Buffer.from(normalizedText, 'utf8')
  if (bom === 'utf8') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body])
  return body
}

// 读取目录结构 - 支持所有文件
function readDirectoryTree(dirPath, basePath = '', maxDepth = null, currentDepth = 0) {
  const items = []
  
  // 先检查目录是否存在
  if (!fs.existsSync(dirPath)) {
    return items
  }
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => {
        if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git')) return false
        return true
      })
      .sort((a, b) => {
        const aIsDir = a.isDirectory()
        const bIsDir = b.isDirectory()
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
        return fileNameCollator.compare(a.name, b.name)
      })

    for (const entry of entries) {
      
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name
      
      if (entry.isDirectory()) {
        const nextDepth = currentDepth + 1
        const canDescend = maxDepth === null || nextDepth <= maxDepth
        const children = canDescend
          ? readDirectoryTree(fullPath, relativePath, maxDepth, nextDepth)
          : []
        items.push({
          id: relativePath,
          name: entry.name,
          type: 'folder',
          path: relativePath,
          children,
          childrenLoaded: canDescend,
          isExpanded: false
        })
      } else {
        // 支持所有文件类型
        items.push({
          id: relativePath,
          name: entry.name,
          type: 'file',
          path: relativePath,
          fileType: getFileType(entry.name)
        })
      }
    }
  } catch (err) {
    // 静默处理目录不存在错误
    if (err.code !== 'ENOENT') {
      console.error('读取目录失败:', err.message)
    }
  }
  return items
}

// IPC 处理器

// 选择目录
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择项目目录'
  })
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false }
  }
  
  const selectedPath = result.filePaths[0]
  
  // 不再强制要求是 OpenSpec 项目
  // 添加到最近项目
  userPreferences.recentProjects = [
    selectedPath,
    ...userPreferences.recentProjects.filter(p => p !== selectedPath)
  ].slice(0, 10)
  savePreferences()
  refreshApplicationMenu()
  
  return { success: true, path: selectedPath, isOpenSpec: isValidOpenSpecProject(selectedPath) }
})

ipcMain.handle('perf-log', async (event, payload) => {
  if (!payload || typeof payload.event !== 'string') {
    logPerf('perf-log', { source: 'renderer', detail: 'missing-event' })
    return { success: false, error: 'missing-event' }
  }
  const { event: name, ...data } = payload
  logPerf(name, { source: 'renderer', ...data })
  return { success: true }
})

// 剪贴板（通过主进程读写，避免 preload 中 clipboard 不可用）
ipcMain.on('clipboard-write-text', (event, text) => {
  try {
    clipboard.writeText(String(text || ''))
  } catch (err) {
    console.error('写入剪贴板失败:', err.message)
  }
})

ipcMain.on('clipboard-read-text', (event) => {
  try {
    event.returnValue = clipboard.readText()
  } catch (err) {
    console.error('读取剪贴板失败:', err.message)
    event.returnValue = ''
  }
})

// 读取目录（限制深度）
ipcMain.handle('read-directory-depth', async (event, payload) => {
  const perfStart = perfLogEnabled ? Date.now() : 0
  const dirPath = payload?.dirPath
  const rawDepth = payload?.maxDepth
  const maxDepth = Number.isFinite(rawDepth) ? Math.max(0, Math.floor(rawDepth)) : null
  try {
    if (!dirPath || typeof dirPath !== 'string') {
      if (perfLogEnabled) {
        logPerf('read-directory-depth', { dirPath, durationMs: Date.now() - perfStart, itemCount: 0, invalid: true })
      }
      return { success: true, items: [] }
    }
    if (!fs.existsSync(dirPath)) {
      if (perfLogEnabled) {
        logPerf('read-directory-depth', { dirPath, maxDepth, durationMs: Date.now() - perfStart, itemCount: 0, missing: true })
      }
      return { success: true, items: [] }
    }
    const items = readDirectoryTree(dirPath, '', maxDepth, 0)
    if (perfLogEnabled) {
      logPerf('read-directory-depth', { dirPath, maxDepth, durationMs: Date.now() - perfStart, itemCount: items.length })
    }
    return { success: true, items }
  } catch (err) {
    if (perfLogEnabled) {
      logPerf('read-directory-depth', { dirPath, maxDepth, durationMs: Date.now() - perfStart, error: err.message })
    }
    return { success: false, error: err.message }
  }
})

// 读取目录
ipcMain.handle('read-directory', async (event, dirPath) => {
  const perfStart = perfLogEnabled ? Date.now() : 0
  try {
    // 检查目录是否存在
    if (!fs.existsSync(dirPath)) {
      if (perfLogEnabled) {
        logPerf('read-directory', { dirPath, durationMs: Date.now() - perfStart, itemCount: 0, missing: true })
      }
      return { success: true, items: [] }
    }
    
    // 不再传入 dirName 作为 basePath，让路径从空开始
    const items = readDirectoryTree(dirPath, '')
    if (perfLogEnabled) {
      logPerf('read-directory', { dirPath, durationMs: Date.now() - perfStart, itemCount: items.length })
    }
    return { success: true, items }
  } catch (err) {
    if (perfLogEnabled) {
      logPerf('read-directory', { dirPath, durationMs: Date.now() - perfStart, error: err.message })
    }
    return { success: false, error: err.message }
  }
})

// 读取文件
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    // 先检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    
    // 检查是否是图片
    const fileType = getFileType(filePath)
    if (fileType === 'image') {
      // 返回 base64 编码的图片
      const data = fs.readFileSync(filePath)
      const base64 = data.toString('base64')
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeType = ext === 'svg' ? 'svg+xml' : ext
      return { 
        success: true, 
        content: `data:image/${mimeType};base64,${base64}`,
        isImage: true
      }
    }
    
    const raw = fs.readFileSync(filePath)
    const decoded = decodeTextBuffer(raw)
    const content = decoded.text
    const eol = detectEol(content)
    return {
      success: true,
      content,
      fileType,
      encoding: decoded.meta.encoding,
      bom: decoded.meta.bom,
      eol
    }
  } catch (err) {
    // 静默处理文件不存在错误
    if (err.code === 'ENOENT') {
      return { success: false, error: '文件不存在' }
    }
    console.error('读取文件失败:', err.message)
    return { success: false, error: err.message }
  }
})

// 保存文件（尽量保留原始编码 / BOM / 换行风格）
ipcMain.handle('save-file', async (event, payload) => {
  const filePath = payload?.filePath
  const content = payload?.content
  const options = payload?.options

  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: '路径参数无效' }
    }
    if (typeof content !== 'string') {
      return { success: false, error: '内容参数无效' }
    }

    let effectiveOptions = options
    if (!effectiveOptions || !effectiveOptions.encoding || !effectiveOptions.eol || !effectiveOptions.bom) {
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath)
          const decoded = decodeTextBuffer(raw)
          effectiveOptions = {
            encoding: decoded.meta.encoding,
            bom: decoded.meta.bom,
            eol: detectEol(decoded.text),
            ...(effectiveOptions || {})
          }
        }
      } catch {
        // ignore probe failures
      }
    }

    const buffer = encodeTextBuffer(content, effectiveOptions || {})
    fs.writeFileSync(filePath, buffer)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 在系统资源管理器中打开/定位
ipcMain.handle('reveal-in-explorer', async (event, payload) => {
  const targetPath = payload?.path
  const isDirectory = !!payload?.isDirectory
  if (!targetPath || typeof targetPath !== 'string') {
    return { success: false, error: '路径参数无效' }
  }

  try {
    const normalized = path.normalize(targetPath)
    if (isDirectory) {
      await shell.openPath(normalized)
    } else {
      shell.showItemInFolder(normalized)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 监听目录变化
ipcMain.handle('watch-directory', async (event, payload) => {
  try {
    const key = typeof payload === 'string' ? 'default' : (payload?.key || 'default')
    const dirPath = typeof payload === 'string' ? payload : payload?.dirPath
    if (!dirPath || typeof dirPath !== 'string') {
      return { success: false, error: '目录参数无效' }
    }

    const previous = fileWatchers.get(key)
    if (previous) {
      await previous.close()
    }

    const watcher = chokidar.watch(dirPath, {
      ignored: /(^|[\/\\])\.|node_modules/,
      persistent: true,
      ignoreInitial: true,
      depth: 10
    })
    
    watcher.on('all', (eventType, filePath) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-changed', {
          key,
          type: eventType,
          path: filePath
        })
      }
    })

    fileWatchers.set(key, watcher)
    
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('unwatch-directory', async (event, key) => {
  const watcherKey = key || 'default'
  try {
    const watcher = fileWatchers.get(watcherKey)
    if (watcher) {
      await watcher.close()
      fileWatchers.delete(watcherKey)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 终端相关 IPC - 主进程直接使用 node-pty
function resolveDefaultUnixShell() {
  const fromEnv = typeof process.env.SHELL === 'string' ? process.env.SHELL.trim() : ''
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh'
  if (fs.existsSync('/bin/bash')) return '/bin/bash'
  return '/bin/sh'
}

const DEFAULT_SHELL = IS_WINDOWS ? 'powershell.exe' : resolveDefaultUnixShell()
const CMD_SHELL = IS_WINDOWS ? (process.env.ComSpec || 'cmd.exe') : null
const USE_CONPTY = IS_WINDOWS
const PASTE_IMAGE_PREFIX = 'img-'
const PASTE_IMAGE_EXT = '.png'
const PASTE_IMAGE_DIR = '.terminal-paste'

function normalizeImagePrefix(prefix) {
  const raw = String(prefix || PASTE_IMAGE_PREFIX)
  const cleaned = raw.replace(/[^a-zA-Z0-9-_]/g, '')
  if (!cleaned) return PASTE_IMAGE_PREFIX
  return cleaned.endsWith('-') ? cleaned : `${cleaned}-`
}

function padNumber(value, width) {
  return String(value).padStart(width, '0')
}

function formatTimestamp(date) {
  const year = date.getFullYear()
  const month = padNumber(date.getMonth() + 1, 2)
  const day = padNumber(date.getDate(), 2)
  const hours = padNumber(date.getHours(), 2)
  const minutes = padNumber(date.getMinutes(), 2)
  const seconds = padNumber(date.getSeconds(), 2)
  const millis = padNumber(date.getMilliseconds(), 3)
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`
}

function createUniqueImageName(dirPath, prefix) {
  const stamp = formatTimestamp(new Date())
  let fileName = `${prefix}${stamp}${PASTE_IMAGE_EXT}`
  let filePath = path.join(dirPath, fileName)
  let counter = 1
  while (fs.existsSync(filePath)) {
    fileName = `${prefix}${stamp}-${counter}${PASTE_IMAGE_EXT}`
    filePath = path.join(dirPath, fileName)
    counter += 1
  }
  return { fileName, filePath }
}

function isGitRepoRoot(cwd) {
  const gitDir = path.join(cwd, '.git')
  try {
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()
  } catch {
    return false
  }
}

function ensureGitignoreLine(cwd, pattern) {
  const gitignorePath = path.join(cwd, '.gitignore')
  let content = ''
  try {
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8')
    }
  } catch {
    return
  }
  if (content.includes(pattern)) return
  const next = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`
  try {
    fs.writeFileSync(gitignorePath, `${next}${pattern}\n`)
  } catch {
    // ignore write errors
  }
}

function ensurePasteDirectory(cwd) {
  const dirPath = path.join(cwd, PASTE_IMAGE_DIR)
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  } catch {
    return null
  }
  hideFile(dirPath)
  return dirPath
}

function hideFile(filePath) {
  if (!IS_WINDOWS) return
  try {
    spawnSync('attrib', ['+h', filePath], { windowsHide: true })
  } catch {
    // ignore attrib failures
  }
}

function normalizeShell(shell) {
  if (!shell) return DEFAULT_SHELL
  const value = String(shell).toLowerCase()

  if (IS_WINDOWS) {
    if (value === 'cmd' || value === 'cmd.exe') return CMD_SHELL
    if (value === 'powershell' || value === 'powershell.exe') return DEFAULT_SHELL
    return DEFAULT_SHELL
  }

  if (value === 'zsh') return '/bin/zsh'
  if (value === 'bash') return '/bin/bash'
  if (value === 'sh') return '/bin/sh'

  return shell
}

function resolveShellArgs(shell) {
  const value = String(shell || '').toLowerCase()
  if (IS_WINDOWS) {
    if (value === 'cmd' || value === 'cmd.exe') return ['/D', '/K', 'chcp 65001 >nul']
    if (value === 'powershell' || value === 'powershell.exe') {
      const init = '$OutputEncoding=[Text.UTF8Encoding]::UTF8; [Console]::InputEncoding=[Text.UTF8Encoding]::UTF8; [Console]::OutputEncoding=[Text.UTF8Encoding]::UTF8; chcp 65001 > $null'
      return ['-NoLogo', '-NoExit', '-Command', init]
    }
    return []
  }

  if (value.endsWith('zsh')) return ['-l']
  if (value.endsWith('bash')) return ['--login']
  return []
}

function resolveCwd(cwd) {
  if (!cwd) return process.cwd()
  try {
    if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
      return cwd
    }
  } catch {
    return process.cwd()
  }
  return process.cwd()
}

function saveClipboardImage(options = {}) {
  const { cwd, prefix } = options || {}
  const resolvedCwd = resolveCwd(cwd)
  const image = clipboard.readImage()
  if (!image || image.isEmpty()) {
    return { success: false, error: 'clipboard-no-image' }
  }
  const buffer = image.toPNG()
  if (!buffer || buffer.length === 0) {
    return { success: false, error: 'clipboard-image-empty' }
  }
  const safePrefix = normalizeImagePrefix(prefix)
  const pasteDir = ensurePasteDirectory(resolvedCwd)
  if (!pasteDir) {
    return { success: false, error: 'create-paste-dir-failed' }
  }
  const { fileName, filePath } = createUniqueImageName(pasteDir, safePrefix)

  try {
    fs.writeFileSync(filePath, buffer)
  } catch (err) {
    return { success: false, error: err.message }
  }

  hideFile(filePath)

  if (isGitRepoRoot(resolvedCwd)) {
    ensureGitignoreLine(resolvedCwd, `${PASTE_IMAGE_DIR}/`)
  }

  return { success: true, fileName, filePath }
}

function startTerminal(options = {}) {
  if (!pty) {
    return { success: false, error: 'node-pty 未安装，请先安装依赖' }
  }

  const { cwd, shell } = typeof options === 'string' ? { cwd: options } : options
  const resolvedCwd = resolveCwd(cwd)
  const resolvedShell = normalizeShell(shell)
  const shellArgs = resolveShellArgs(shell || resolvedShell)
  const sessionId = ++ptySessionId

  try {
    console.log('[Terminal] spawn', {
      requestedShell: shell,
      resolvedShell,
      shellArgs,
      cwd: resolvedCwd,
      useConpty: USE_CONPTY,
      sessionId
    })
    const ptyOptions = {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: process.env
    }
    if (IS_WINDOWS) {
      ptyOptions.useConpty = USE_CONPTY
    }
    const spawned = pty.spawn(resolvedShell, shellArgs, ptyOptions)
    ptySessions.set(sessionId, {
      id: sessionId,
      pty: spawned,
      shell: resolvedShell
    })

    spawned.onData((data) => {
      if (!ptySessions.has(sessionId)) return
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', { sessionId, data })
      }
    })

    spawned.onExit(({ exitCode }) => {
      const exists = ptySessions.has(sessionId)
      console.log('[Terminal] exit', { resolvedShell, exitCode, sessionId, exists })
      if (!exists) return
      ptySessions.delete(sessionId)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-exit', { sessionId, exitCode })
      }
    })
  } catch (err) {
    return { success: false, error: err.message }
  }

  return { success: true, sessionId }
}

function stopTerminal(sessionId) {
  if (sessionId) {
    const session = ptySessions.get(sessionId)
    if (session && session.pty) {
      session.pty.kill()
    }
    return
  }
  for (const session of ptySessions.values()) {
    if (session && session.pty) {
      session.pty.kill()
    }
  }
}

ipcMain.handle('terminal-start', async (event, options) => {
  return startTerminal(options || {})
})

ipcMain.handle('terminal-write', async (event, payload) => {
  const { sessionId, data } = payload || {}
  if (!sessionId || !ptySessions.has(sessionId)) {
    return { success: false, error: '终端未启动' }
  }
  const session = ptySessions.get(sessionId)
  session.pty.write(data)
  return { success: true }
})

ipcMain.handle('terminal-resize', async (event, payload) => {
  const { sessionId, cols, rows } = payload || {}
  if (sessionId && ptySessions.has(sessionId) && Number.isInteger(cols) && Number.isInteger(rows)) {
    const session = ptySessions.get(sessionId)
    session.pty.resize(cols, rows)
  }
  return { success: true }
})

ipcMain.handle('terminal-stop', async (event, sessionId) => {
  stopTerminal(sessionId)
  return { success: true }
})

ipcMain.handle('terminal-paste-image', async (event, options) => {
  return saveClipboardImage(options || {})
})

ipcMain.handle('get-terminal-appearance', async (event, shell) => {
  return getTerminalAppearance(shell)
})

// 获取偏好设置
ipcMain.handle('get-preferences', async () => {
  return userPreferences
})

// 设置偏好
ipcMain.handle('set-preferences', async (event, prefs) => {
  userPreferences = { ...userPreferences, ...prefs }
  savePreferences()
  return { success: true }
})

// 获取最近项目
ipcMain.handle('get-recent-projects', async () => {
  return userPreferences.recentProjects.filter(p => fs.existsSync(p))
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  for (const watcher of fileWatchers.values()) {
    try {
      watcher.close()
    } catch {
      // ignore watcher close errors
    }
  }
  fileWatchers.clear()
  stopTerminal()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
