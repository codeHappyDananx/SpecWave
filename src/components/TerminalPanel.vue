<template>
  <aside class="terminal-panel" :style="panelStyle">
    
    <div class="terminal-header">
      <div class="terminal-tabs">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="terminal-tab"
          :class="{ active: session.id === activeSessionId }"
          role="button"
          tabindex="0"
          @click="setActiveSession(session.id)"
          @keydown.enter="setActiveSession(session.id)"
        >
          <span class="tab-title">{{ session.title }}</span>
          <span class="status-dot" :class="{ connected: session.connected }"></span>
          <button class="tab-close" @click.stop="closeSession(session.id)" title="关闭会话">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="terminal-actions">
        <select v-model="newSessionShell" class="terminal-shell" title="新建会话类型">
          <template v-if="isWindows">
            <option value="powershell">PowerShell</option>
            <option value="cmd">CMD</option>
          </template>
          <template v-else>
            <option value="zsh">zsh</option>
            <option value="bash">bash</option>
          </template>
        </select>
        <button class="btn-icon" @click="createSession()" title="新建会话">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="btn-icon" @click="$emit('close')" title="关闭终端">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    
    <div class="terminal-container" ref="terminalContainer">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="terminal-session"
        :class="{ active: session.id === activeSessionId }"
        :ref="(el) => setSessionContainer(session.id, el as HTMLElement)"
      ></div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import type { TerminalAppearance, TerminalShell } from '../types'
import { useUIStore } from '../stores/ui'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const props = defineProps<{
  width: number
  projectPath: string
  isMain: boolean
  collapsed: boolean
}>()

const emit = defineEmits<{
  'close': []
}>()

const uiStore = useUIStore()

type TerminalSession = {
  id: number
  shell: TerminalShell
  title: string
  connected: boolean
  appearance?: TerminalAppearance
}

type HotDataShape = {
  terminalByProjectPath?: Record<string, {
    sessions: Array<{ id: number; shell: TerminalShell; title: string }>
    activeSessionId: number | null
    shellCounts: Record<string, number>
  }>
}

const terminalContainer = ref<HTMLElement | null>(null)
const sessions = ref<TerminalSession[]>([])
const activeSessionId = ref<number | null>(null)
const isWindows = window.electronAPI?.platform === 'win32'
const newSessionShell = ref<TerminalShell>(isWindows ? 'powershell' : 'zsh')

const terminalInstances = new Map<number, Terminal>()
const fitAddons = new Map<number, FitAddon>()
const sessionContainers = new Map<number, HTMLElement>()
let resizeObserver: ResizeObserver | null = null
let removeTerminalDataListener: (() => void) | null = null
let removeTerminalExitListener: (() => void) | null = null
let contextMenuTarget: HTMLElement | null = null
let initialFitFrame: number | null = null
let initialFitTimer: number | null = null
let pasteInFlight = false
let skipStopOnCleanup = false
let fitDebounceTimer: number | null = null

const scheduleFit = () => {
  if (fitDebounceTimer !== null) {
    window.clearTimeout(fitDebounceTimer)
  }
  fitDebounceTimer = window.setTimeout(() => {
    fitDebounceTimer = null
    fitActiveSession()
  }, 60)
}

const defaultTheme = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff'
}

const solarizedLightTheme = {
  background: '#fdf6e3',
  foreground: '#657b83',
  cursor: '#657b83',
  cursorAccent: '#fdf6e3',
  selectionBackground: '#eee8d5',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3'
}

const defaultFontFamily = '"Consolas", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'
const defaultFontSize = 14
const pasteImagePrefix = 'img-'

const isSystemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
const updateSystemTheme = (e: MediaQueryListEvent) => {
  isSystemDark.value = e.matches
}

const effectiveTheme = computed(() => {
  // If user selects "Light", use Solarized Light
  if (uiStore.theme === 'light') {
    return solarizedLightTheme
  }
  // If user selects "Dark", use Default (Dark)
  if (uiStore.theme === 'dark') {
    return defaultTheme
  }
  // If user selects "System", return null to indicate "Use Session Appearance"
  return null
})

const resolvedTheme = computed(() => {
  if (effectiveTheme.value) return effectiveTheme.value
  // In System mode, use the active session's appearance theme, or fallback to default
  return activeAppearance.value?.theme || defaultTheme
})

const uiThemeVariables = computed(() => {
  const t = resolvedTheme.value
  
  // Specific override for Solarized Light to ensure perfect visibility
  if (t === solarizedLightTheme) {
    return {
      '--term-bg': '#fdf6e3',
      '--term-header-bg': '#eee8d5',
      '--term-border': '#d6d0c0',
      '--term-text': '#657b83',
      '--term-text-active': '#073642', // Dark text for active tab
      '--term-tab-active-bg': '#fdf6e3',
      '--term-hover-bg': '#e0dad0',
      '--term-input-bg': '#fdf6e3',
      '--term-scroll-thumb': '#93a1a1',
      '--term-text-dim': '#93a1a1'
    }
  }

  // Dynamic mapping for System/Dark themes
  return {
    '--term-bg': t.background || '#1e1e1e',
    '--term-header-bg': t.background || '#252526',
    '--term-border': t.brightBlack || t.cursor || '#3c3c3c',
    '--term-text': t.foreground || '#cccccc',
    // Avoid brightWhite in dynamic themes as it might be background color in light themes. 
    // Prefer cursor color which is usually high contrast.
    '--term-text-active': t.cursor || t.brightWhite || '#ffffff',
    '--term-tab-active-bg': t.background || '#1e1e1e',
    '--term-hover-bg': t.selectionBackground || t.brightBlack || '#3c3c3c',
    '--term-input-bg': t.background || '#1e1e1e',
    '--term-scroll-thumb': t.brightBlack || '#4a4a4a',
    '--term-text-dim': t.brightBlack || '#9e9e9e'
  }
})

const activeAppearance = computed(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((session) => session.id === activeSessionId.value)?.appearance || null
})

const panelStyle = computed(() => {
  const baseStyle: Record<string, string> = props.isMain
    ? { flex: '1 1 auto', width: 'auto', minWidth: '160px' }
    : { width: `${props.width}px` }
  
  // Apply theme variables
  return {
    ...baseStyle,
    ...uiThemeVariables.value
  }
})

onMounted(async () => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', updateSystemTheme)
  await initSessions()
})

onUnmounted(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.removeEventListener('change', updateSystemTheme)
  cleanup()
})

watch(effectiveTheme, (newTheme) => {
  if (newTheme) {
    // Enforce specific theme (Light/Dark mode)
    for (const terminal of terminalInstances.values()) {
      terminal.options.theme = newTheme
    }
  } else {
    // Revert to System/Session theme
    for (const [id, terminal] of terminalInstances) {
      const session = sessions.value.find((s) => s.id === id)
      // Use session's own resolved theme, or fallback
      const theme = session?.appearance?.theme || defaultTheme
      terminal.options.theme = theme
    }
  }
})

watch(() => props.projectPath, async (newPath) => {
  if (newPath) {
    await resetSessions(newPath)
  }
})

watch(() => props.width, () => {
  if (!props.collapsed) {
    scheduleFit()
  }
})

watch(() => props.collapsed, (next) => {
  if (!next) nextTick(() => scheduleInitialFit())
})

watch(() => props.isMain, () => {
  if (!props.collapsed) nextTick(() => scheduleInitialFit())
})

function cleanup() {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (removeTerminalDataListener) {
    removeTerminalDataListener()
    removeTerminalDataListener = null
  }
  if (removeTerminalExitListener) {
    removeTerminalExitListener()
    removeTerminalExitListener = null
  }
  if (window.electronAPI && !skipStopOnCleanup) {
    for (const session of sessions.value) {
      void window.electronAPI.terminalStop(session.id)
    }
  }
  if (initialFitFrame !== null) {
    cancelAnimationFrame(initialFitFrame)
    initialFitFrame = null
  }
  if (initialFitTimer !== null) {
    clearTimeout(initialFitTimer)
    initialFitTimer = null
  }
  if (fitDebounceTimer !== null) {
    clearTimeout(fitDebounceTimer)
    fitDebounceTimer = null
  }
  if (contextMenuTarget) {
    contextMenuTarget.removeEventListener('contextmenu', handleContextMenu, true)
    contextMenuTarget = null
  }
  sessions.value.forEach((session) => disposeSession(session.id))
  sessions.value = []
  activeSessionId.value = null
}

async function initSessions() {
  if (!terminalContainer.value) return

  if (import.meta.hot) {
    const hot = import.meta.hot
    const data = hot.data as HotDataShape
    if (!data.terminalByProjectPath) {
      data.terminalByProjectPath = {}
    }
    hot.dispose(() => {
      skipStopOnCleanup = true
      data.terminalByProjectPath![props.projectPath] = {
        sessions: sessions.value.map((session) => ({
          id: session.id,
          shell: session.shell,
          title: session.title
        })),
        activeSessionId: activeSessionId.value,
        shellCounts: { ...shellCounts }
      }
    })
  }

  contextMenuTarget = terminalContainer.value
  // xterm 内部可能会 stopPropagation，使用 capture 确保能收到右键事件
  contextMenuTarget.addEventListener('contextmenu', handleContextMenu, true)

  resizeObserver = new ResizeObserver(() => {
    if (!props.collapsed) {
      scheduleFit()
    }
  })
  resizeObserver.observe(terminalContainer.value)

  attachTerminalListeners()

  const hotData = (import.meta.hot?.data as HotDataShape | undefined)?.terminalByProjectPath?.[props.projectPath]
  if (hotData && hotData.sessions.length > 0) {
    if (hotData.shellCounts) {
      for (const [key, value] of Object.entries(hotData.shellCounts)) {
        if (key in shellCounts) {
          shellCounts[key as TerminalShell] = Number(value) || 0
        }
      }
    }
    sessions.value = hotData.sessions.map((session) => ({
      id: session.id,
      shell: session.shell,
      title: session.title,
      connected: true
    }))
    activeSessionId.value = hotData.activeSessionId || hotData.sessions[0].id
    await nextTick()
    for (const session of sessions.value) {
      await createTerminalInstance(session.id, session.shell)
    }
    scheduleInitialFit()
    return
  }

  await createSession(isWindows ? 'powershell' : 'zsh')
}

function attachTerminalListeners() {
  if (!window.electronAPI) {
    return
  }

  removeTerminalDataListener = window.electronAPI.onTerminalData((payload) => {
    const terminal = terminalInstances.get(payload.sessionId)
    if (!terminal) return
    terminal.write(payload.data)
  })

  removeTerminalExitListener = window.electronAPI.onTerminalExit((payload) => {
    const session = sessions.value.find((item) => item.id === payload.sessionId)
    if (session) {
      session.connected = false
    }
    const terminal = terminalInstances.get(payload.sessionId)
    if (terminal) {
      terminal.writeln(`\r\n\x1b[33m[进程已退出，代码: ${payload.exitCode}]\x1b[0m`)
    }
  })
}

function normalizePaste(text: string): string {
  return text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
}

function getActiveTerminal(): Terminal | null {
  if (activeSessionId.value === null) return null
  return terminalInstances.get(activeSessionId.value) || null
}

function getActiveFitAddon(): FitAddon | null {
  if (activeSessionId.value === null) return null
  return fitAddons.get(activeSessionId.value) || null
}

function copySelection(target?: Terminal) {
  const terminal = target || getActiveTerminal()
  if (!terminal || !window.electronAPI) return
  if (!terminal.hasSelection()) return
  const text = terminal.getSelection()
  if (text) {
    window.electronAPI.clipboardWriteText(text)
    terminal.clearSelection()
  }
}

async function pasteFromClipboard() {
  if (!window.electronAPI) return
  const sessionId = activeSessionId.value
  if (sessionId === null) return
  if (pasteInFlight) return
  pasteInFlight = true
  try {
    if (window.electronAPI.terminalPasteImage) {
      const result = await window.electronAPI.terminalPasteImage({
        cwd: props.projectPath,
        prefix: pasteImagePrefix
      })
      if (result?.success && (result.filePath || result.fileName)) {
        const outputPath = result.filePath || result.fileName || ''
        if (!outputPath) return
        await window.electronAPI.terminalWrite({ sessionId, data: outputPath })
        return
      }
    }

    const text = window.electronAPI.clipboardReadText()
    if (!text) return
    const content = normalizePaste(text)
    await window.electronAPI.terminalWrite({ sessionId, data: content })
  } finally {
    window.setTimeout(() => { pasteInFlight = false }, 120)
  }
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  const terminal = getActiveTerminal()
  if (!terminal || !window.electronAPI) return
  if (terminal.hasSelection()) {
    copySelection(terminal)
  } else {
    void pasteFromClipboard()
  }
}

async function resolveTerminalAppearance(shellName: TerminalShell): Promise<TerminalAppearance | null> {
  if (!window.electronAPI?.getTerminalAppearance) return null
  try {
    const appearance = await window.electronAPI.getTerminalAppearance(shellName)
    console.log('[Terminal] appearance loaded', { shellName, appearance })
    return appearance
  } catch (err) {
    console.warn('[Terminal] Failed to load appearance', err)
    return null
  }
}

function setSessionContainer(sessionId: number, element: HTMLElement | null) {
  if (element) {
    sessionContainers.set(sessionId, element)
  } else {
    sessionContainers.delete(sessionId)
  }
}

function setActiveSession(sessionId: number) {
  if (activeSessionId.value === sessionId) return
  activeSessionId.value = sessionId
  nextTick(() => scheduleInitialFit())
}

function getSessionLabel(shellName: TerminalShell) {
  if (shellName === 'cmd') return 'CMD'
  if (shellName === 'zsh') return 'zsh'
  if (shellName === 'bash') return 'bash'
  return 'PowerShell'
}

const shellCounts: Record<TerminalShell, number> = {
  powershell: 0,
  cmd: 0,
  zsh: 0,
  bash: 0
}

function createSessionTitle(shellName: TerminalShell) {
  shellCounts[shellName] += 1
  return `${getSessionLabel(shellName)} ${shellCounts[shellName]}`
}

async function createTerminalInstance(sessionId: number, shellName: TerminalShell) {
  const appearance = await resolveTerminalAppearance(shellName)
  // If effectiveTheme is set (Light/Dark mode), use it.
  // Otherwise (System mode), use the resolved appearance theme.
  const theme = effectiveTheme.value || appearance?.theme || defaultTheme
  const fontFamily = appearance?.fontFamily || defaultFontFamily
  const fontSize = appearance?.fontSize ? Math.max(17, appearance.fontSize) : defaultFontSize
  const cursorBlink = typeof appearance?.cursorBlink === 'boolean' ? appearance.cursorBlink : true
  const cursorStyle = appearance?.cursorStyle || 'block'
  const allowTransparency = appearance?.allowTransparency || false
  const drawBoldTextInBrightColors = typeof appearance?.drawBoldTextInBrightColors === 'boolean'
    ? appearance.drawBoldTextInBrightColors
    : undefined

  const session = sessions.value.find((entry) => entry.id === sessionId)
  if (session) {
    session.appearance = appearance || undefined
  }

  const terminal = new Terminal({
    cursorBlink,
    cursorStyle,
    fontSize,
    fontFamily,
    convertEol: true,
    allowTransparency,
    drawBoldTextInBrightColors,
    theme,
    scrollback: 10000, // Increase scrollback buffer for long conversations
    fastScrollModifier: 'ctrl',
    overviewRulerWidth: 10
  })

  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  terminal.attachCustomKeyEventHandler((event) => {
    const key = event.key.toLowerCase()
    const hasSelection = terminal.hasSelection()

    if (event.ctrlKey && !event.shiftKey && key === 'c') {
      if (hasSelection) {
        copySelection(terminal)
        return false
      }
      return true
    }

    if (
      (event.ctrlKey && !event.shiftKey && key === 'v') ||
      (event.ctrlKey && event.shiftKey && key === 'v') ||
      (event.shiftKey && key === 'insert')
    ) {
      if (event.type !== 'keydown' || event.repeat) return false
      event.preventDefault()
      event.stopPropagation()
      void pasteFromClipboard()
      return false
    }

    if ((event.ctrlKey && event.shiftKey && key === 'c') || (event.ctrlKey && key === 'insert')) {
      if (hasSelection) {
        copySelection(terminal)
      }
      return false
    }

    return true
  })

  terminal.onData((data) => {
    if (window.electronAPI) {
      window.electronAPI.terminalWrite({ sessionId, data })
    }
  })

  terminal.onResize(({ cols, rows }) => {
    if (window.electronAPI) {
      window.electronAPI.terminalResize({ sessionId, cols, rows })
    }
  })

  terminalInstances.set(sessionId, terminal)
  fitAddons.set(sessionId, fitAddon)

  await nextTick()
  const container = sessionContainers.get(sessionId)
  if (container) {
    terminal.open(container)
    scheduleInitialFit()
  }
}

async function createSession(shellName?: TerminalShell) {
  if (!window.electronAPI) return
  const resolvedShell = shellName || newSessionShell.value
  const result = await window.electronAPI.terminalStart({
    cwd: props.projectPath,
    shell: resolvedShell
  })
  if (!result.success || !result.sessionId) {
    const terminal = getActiveTerminal()
    terminal?.writeln(`\r\n\x1b[31m[错误: ${result.error || '启动失败'}]\x1b[0m`)
    return
  }
  const title = createSessionTitle(resolvedShell)
  const session: TerminalSession = {
    id: result.sessionId,
    shell: resolvedShell,
    title,
    connected: true
  }
  sessions.value.push(session)
  activeSessionId.value = session.id
  await createTerminalInstance(session.id, resolvedShell)
}

function disposeSession(sessionId: number) {
  const terminal = terminalInstances.get(sessionId)
  if (terminal) {
    terminal.dispose()
  }
  terminalInstances.delete(sessionId)
  fitAddons.delete(sessionId)
  sessionContainers.delete(sessionId)
}

async function closeSession(sessionId: number) {
  if (window.electronAPI) {
    await window.electronAPI.terminalStop(sessionId)
  }
  disposeSession(sessionId)
  const nextSessions = sessions.value.filter((session) => session.id !== sessionId)
  sessions.value = nextSessions

  if (nextSessions.length === 0) {
    activeSessionId.value = null
    await createSession(isWindows ? 'powershell' : 'zsh')
    return
  }

  if (activeSessionId.value === sessionId) {
    activeSessionId.value = nextSessions[0].id
    nextTick(() => scheduleInitialFit())
  }
}

async function resetSessions(newPath: string) {
  if (window.electronAPI) {
    await Promise.all(sessions.value.map((session) => window.electronAPI!.terminalStop(session.id)))
  }
  sessions.value.forEach((session) => disposeSession(session.id))
  sessions.value = []
  activeSessionId.value = null
  for (const key of Object.keys(shellCounts) as TerminalShell[]) {
    shellCounts[key] = 0
  }
  if (newPath) {
    await createSession(isWindows ? 'powershell' : 'zsh')
  }
}

function fitActiveSession() {
  if (props.collapsed) return
  const container = terminalContainer.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  if (rect.width < 60 || rect.height < 60) return
  const fitAddon = getActiveFitAddon()
  if (!fitAddon) return
  try {
    fitAddon.fit()
  } catch {
    // ignore fit errors
  }
}

function scheduleInitialFit() {
  if (props.collapsed) return
  if (!getActiveFitAddon()) return
  if (initialFitFrame !== null) {
    cancelAnimationFrame(initialFitFrame)
  }
  if (initialFitTimer !== null) {
    clearTimeout(initialFitTimer)
  }
  initialFitFrame = requestAnimationFrame(() => {
    initialFitFrame = null
    fitActiveSession()
    initialFitTimer = window.setTimeout(() => {
      initialFitTimer = null
      fitActiveSession()
    }, 80)
  })
}

</script>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--term-bg);
  position: relative;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--term-header-bg);
  border-bottom: 1px solid var(--term-border);
  flex-shrink: 0;
}

.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.terminal-tabs::-webkit-scrollbar {
  display: none;
}

.terminal-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--term-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.terminal-tab.active {
  color: var(--term-text-active);
  background: var(--term-tab-active-bg);
  border-color: var(--term-border);
}

.tab-title {
  white-space: nowrap;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
}

.tab-close:hover {
  background: var(--term-hover-bg);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.status-dot.connected {
  background: #0dbc79;
}

.terminal-actions {
  display: flex;
  gap: 4px;
}

.terminal-shell {
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--term-text);
  background: var(--term-input-bg);
  border: 1px solid var(--term-border);
  border-radius: 4px;
}

.terminal-shell:focus {
  outline: none;
  border-color: var(--accent-color);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--term-text-dim);
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--term-hover-bg);
  color: var(--term-text-active);
}

.terminal-container {
  flex: 1;
  padding: 4px;
  overflow: hidden;
  position: relative;
}

.terminal-session {
  width: 100%;
  height: 100%;
  display: none;
}

.terminal-session.active {
  display: block;
}

.terminal-container :deep(.xterm) {
  height: 100%;
}

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.terminal-container :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}

.terminal-container :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}

.terminal-container :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: var(--term-scroll-thumb);
  border-radius: 4px;
}
</style>
