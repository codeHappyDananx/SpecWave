import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProjectStore } from './project'

type ProjectTab = {
  id: number
  storeKey: string
  title: string
  searchQuery: string
}

const MAX_TABS = 5
let nextTabId = 1

function isProjectTab(value: unknown): value is ProjectTab {
  if (!value || typeof value !== 'object') return false
  const tab = value as ProjectTab
  return typeof tab.id === 'number' && typeof tab.storeKey === 'string'
}

function createBlankTab(): ProjectTab {
  nextTabId += 1
  return {
    id: nextTabId,
    storeKey: `tab-${nextTabId}`,
    title: '未命名',
    searchQuery: ''
  }
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<ProjectTab[]>([{ id: 1, storeKey: 'tab-1', title: '未命名', searchQuery: '' }])
  const activeTabId = ref(1)

  const safeTabs = computed(() => {
    const raw = Array.isArray(tabs.value) ? tabs.value : []
    const filtered = raw.filter(isProjectTab).map((tab) => ({
      ...tab,
      title: typeof tab.title === 'string' ? tab.title : '未命名',
      searchQuery: typeof tab.searchQuery === 'string' ? tab.searchQuery : ''
    }))
    if (filtered.length > 0) return filtered
    return [{ id: 1, storeKey: 'tab-1', title: '未命名', searchQuery: '' }]
  })

  const activeTab = computed(() => {
    return safeTabs.value.find(tab => tab.id === activeTabId.value) || safeTabs.value[0]
  })

  const activeStoreKey = computed(() => activeTab.value?.storeKey || 'tab-1')

  function ensureValidState() {
    const raw = Array.isArray(tabs.value) ? tabs.value : []
    const sanitized = raw.filter(isProjectTab).map((tab) => ({
      ...tab,
      title: typeof tab.title === 'string' ? tab.title : '未命名',
      searchQuery: typeof tab.searchQuery === 'string' ? tab.searchQuery : ''
    }))

    if (sanitized.length === 0) {
      tabs.value = [{ id: 1, storeKey: 'tab-1', title: '未命名', searchQuery: '' }]
      activeTabId.value = 1
      nextTabId = Math.max(nextTabId, 1)
      return
    }

    tabs.value = sanitized
    for (const tab of sanitized) {
      nextTabId = Math.max(nextTabId, tab.id)
    }
    if (!sanitized.some(tab => tab.id === activeTabId.value)) {
      activeTabId.value = sanitized[0].id
    }
  }

  ensureValidState()

  function setActiveTab(tabId: number) {
    ensureValidState()
    const exists = safeTabs.value.some(tab => tab.id === tabId)
    if (!exists) return
    activeTabId.value = tabId
  }

  function ensureCapacityOrWarn(): boolean {
    if (safeTabs.value.length < MAX_TABS) return true
    window.alert('最多只能打开 5 个页签')
    return false
  }

  function newTab(): ProjectTab | null {
    ensureValidState()
    if (!ensureCapacityOrWarn()) return null
    const tab = createBlankTab()
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  function closeTab(tabId: number) {
    ensureValidState()
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return

    const tab = tabs.value[index]
    const projectStore = useProjectStore(tab.storeKey)
    projectStore.resetProject()

    const nextTabs = tabs.value.filter(tabItem => tabItem.id !== tabId)
    tabs.value = nextTabs

    if (tabs.value.length === 0) {
      const replacement = createBlankTab()
      tabs.value = [replacement]
      activeTabId.value = replacement.id
      return
    }

    if (activeTabId.value === tabId) {
      const fallback = tabs.value[Math.min(index, tabs.value.length - 1)]
      activeTabId.value = fallback.id
    }
  }

  function closeActiveTab() {
    closeTab(activeTabId.value)
  }

  function syncActiveTabTitleFromProject() {
    ensureValidState()
    const tab = activeTab.value
    if (!tab) return
    const projectStore = useProjectStore(tab.storeKey)
    tab.title = projectStore.projectName || '未命名'
    tabs.value = tabs.value.map(t => (t.id === tab.id ? { ...t, title: tab.title } : t))
  }

  function setActiveSearchQuery(query: string) {
    ensureValidState()
    const tab = activeTab.value
    if (!tab) return
    tab.searchQuery = query
    tabs.value = tabs.value.map(t => (t.id === tab.id ? { ...t, searchQuery: query } : t))
  }

  async function openRecent(projectPath: string) {
    ensureValidState()
    const currentTab = activeTab.value
    const currentStore = useProjectStore(currentTab.storeKey)

    if (currentStore.hasProject) {
      const tab = newTab()
      if (!tab) return
      const store = useProjectStore(tab.storeKey)
      await store.openProject(projectPath)
      tab.title = store.projectName || '未命名'
      tabs.value = tabs.value.map(t => (t.id === tab.id ? { ...t, title: tab.title } : t))
      return
    }

    await currentStore.openProject(projectPath)
    currentTab.title = currentStore.projectName || '未命名'
    tabs.value = tabs.value.map(t => (t.id === currentTab.id ? { ...t, title: currentTab.title } : t))
  }

  return {
    tabs,
    safeTabs,
    activeTabId,
    activeTab,
    activeStoreKey,
    setActiveTab,
    newTab,
    closeTab,
    closeActiveTab,
    openRecent,
    syncActiveTabTitleFromProject,
    setActiveSearchQuery
  }
})
