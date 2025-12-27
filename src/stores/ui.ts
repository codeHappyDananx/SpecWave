import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  // 状态
  const theme = ref<'light' | 'dark' | 'system'>('system')
  const sidebarWidth = ref(180)
  const terminalWidth = ref(350)
  const terminalOpen = ref(false)
  const sidebarCollapsed = ref(false)
  const contentCollapsed = ref(false)
  const terminalCollapsed = ref(false)
  const markdownLineNumbers = ref(true)
  const searchQuery = ref('')
  const isSearching = ref(false)

  function normalizePanels(): void {
    if (!terminalOpen.value) {
      terminalCollapsed.value = false
    }
  }

  // 初始化主题
  function initTheme(): void {
    // 尝试从 Electron 获取偏好
    if (window.electronAPI) {
      window.electronAPI.getPreferences().then(prefs => {
        if (prefs.theme) {
          theme.value = prefs.theme
        }
        if (prefs.sidebarWidth) {
          sidebarWidth.value = Math.max(80, prefs.sidebarWidth)
        }
        if (prefs.terminalWidth) {
          terminalWidth.value = Math.max(80, prefs.terminalWidth)
        }
        if (prefs.terminalOpen !== undefined) {
          terminalOpen.value = prefs.terminalOpen
        }
        if (prefs.sidebarCollapsed !== undefined) {
          sidebarCollapsed.value = prefs.sidebarCollapsed
        }
        if (prefs.contentCollapsed !== undefined) {
          contentCollapsed.value = prefs.contentCollapsed
        }
        if (prefs.terminalCollapsed !== undefined) {
          terminalCollapsed.value = prefs.terminalCollapsed
        }
        if (prefs.markdownLineNumbers !== undefined) {
          markdownLineNumbers.value = prefs.markdownLineNumbers === true
        }
        normalizePanels()
        applyTheme()
      })
    } else {
      // 从 localStorage 获取
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        theme.value = saved
      }
      const savedSidebarWidth = localStorage.getItem('sidebarWidth')
      if (savedSidebarWidth) sidebarWidth.value = Math.max(80, Number(savedSidebarWidth))
      const savedTerminalWidth = localStorage.getItem('terminalWidth')
      if (savedTerminalWidth) terminalWidth.value = Math.max(80, Number(savedTerminalWidth))
      const savedTerminalOpen = localStorage.getItem('terminalOpen')
      if (savedTerminalOpen !== null) terminalOpen.value = savedTerminalOpen === 'true'
      const savedSidebarCollapsed = localStorage.getItem('sidebarCollapsed')
      if (savedSidebarCollapsed !== null) sidebarCollapsed.value = savedSidebarCollapsed === 'true'
      const savedContentCollapsed = localStorage.getItem('contentCollapsed')
      if (savedContentCollapsed !== null) contentCollapsed.value = savedContentCollapsed === 'true'
      const savedTerminalCollapsed = localStorage.getItem('terminalCollapsed')
      if (savedTerminalCollapsed !== null) terminalCollapsed.value = savedTerminalCollapsed === 'true'
      const savedMarkdownLineNumbers = localStorage.getItem('markdownLineNumbers')
      if (savedMarkdownLineNumbers !== null) markdownLineNumbers.value = savedMarkdownLineNumbers === 'true'
      normalizePanels()
      applyTheme()
    }
  }

  // 应用主题
  function applyTheme(): void {
    const root = document.documentElement
    let effectiveTheme = theme.value
    
    if (effectiveTheme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    
    if (effectiveTheme === 'dark') {
      root.classList.add('dark-theme')
      root.classList.remove('light-theme')
    } else {
      root.classList.add('light-theme')
      root.classList.remove('dark-theme')
    }
  }

  // 切换主题
  function toggleTheme(): void {
    if (theme.value === 'light') {
      theme.value = 'dark'
    } else if (theme.value === 'dark') {
      theme.value = 'system'
    } else {
      theme.value = 'light'
    }
    
    applyTheme()
    savePreferences()
  }

  // 设置主题
  function setTheme(newTheme: 'light' | 'dark' | 'system'): void {
    theme.value = newTheme
    applyTheme()
    savePreferences()
  }

  // 设置侧边栏宽度
  function setSidebarWidth(width: number): void {
    sidebarWidth.value = Math.max(80, width)
    savePreferences()
  }

  // 设置终端宽度
  function setTerminalWidth(width: number): void {
    terminalWidth.value = Math.max(80, width)
    savePreferences()
  }

  // 切换终端
  function toggleTerminal(): void {
    terminalOpen.value = !terminalOpen.value
    if (!terminalOpen.value) {
      terminalCollapsed.value = false
    }
    savePreferences()
  }

  function toggleSidebarCollapsed(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
    savePreferences()
  }

  function collapseContent(): void {
    contentCollapsed.value = true
    savePreferences()
  }

  function expandContent(): void {
    contentCollapsed.value = false
    savePreferences()
  }

  function collapseTerminal(): void {
    if (!terminalOpen.value) return
    terminalCollapsed.value = true
    savePreferences()
  }

  function expandTerminal(): void {
    terminalCollapsed.value = false
    savePreferences()
  }

  function expandSidebar(): void {
    sidebarCollapsed.value = false
    savePreferences()
  }

  function toggleMarkdownLineNumbers(): void {
    markdownLineNumbers.value = !markdownLineNumbers.value
    savePreferences()
  }

  // 设置搜索查询
  function setSearchQuery(query: string): void {
    searchQuery.value = query
    isSearching.value = query.length > 0
  }

  // 清除搜索
  function clearSearch(): void {
    searchQuery.value = ''
    isSearching.value = false
  }

  // 保存偏好设置
  async function savePreferences(): Promise<void> {
    if (window.electronAPI) {
      await window.electronAPI.setPreferences({
        theme: theme.value,
        markdownLineNumbers: markdownLineNumbers.value,
        sidebarWidth: sidebarWidth.value,
        terminalWidth: terminalWidth.value,
        terminalOpen: terminalOpen.value,
        sidebarCollapsed: sidebarCollapsed.value,
        contentCollapsed: contentCollapsed.value,
        terminalCollapsed: terminalCollapsed.value
      })
    } else {
      localStorage.setItem('theme', theme.value)
      localStorage.setItem('markdownLineNumbers', String(markdownLineNumbers.value))
      localStorage.setItem('sidebarWidth', String(sidebarWidth.value))
      localStorage.setItem('terminalWidth', String(terminalWidth.value))
      localStorage.setItem('terminalOpen', String(terminalOpen.value))
      localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed.value))
      localStorage.setItem('contentCollapsed', String(contentCollapsed.value))
      localStorage.setItem('terminalCollapsed', String(terminalCollapsed.value))
    }
  }

  // 监听系统主题变化
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme()
      }
    })
  }

  return {
    // 状态
    theme,
    sidebarWidth,
    terminalWidth,
    terminalOpen,
    sidebarCollapsed,
    contentCollapsed,
    terminalCollapsed,
    markdownLineNumbers,
    searchQuery,
    isSearching,
    
    // 方法
    initTheme,
    applyTheme,
    toggleTheme,
    setTheme,
    setSidebarWidth,
    setTerminalWidth,
    toggleTerminal,
    toggleSidebarCollapsed,
    collapseContent,
    expandContent,
    collapseTerminal,
    expandTerminal,
    expandSidebar,
    toggleMarkdownLineNumbers,
    setSearchQuery,
    clearSearch,
    savePreferences
  }
})
