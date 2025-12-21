<template>
  <div class="app-container" :class="{ 'no-project': !projectStore.hasProject }">
    <!-- 项目选择界面 -->
    <div v-if="!projectStore.hasProject" class="welcome-screen">
      <div class="welcome-content">
        <div class="logo">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <h1>OpenSpec Visualizer</h1>
        <p class="subtitle">浏览和管理项目文件</p>
        
        <button class="btn-primary" @click="selectProject" :disabled="projectStore.isLoading">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {{ projectStore.isLoading ? '加载中...' : '选择项目目录' }}
        </button>
        
        <div v-if="recentProjects.length > 0" class="recent-projects">
          <h3>最近打开的项目</h3>
          <ul>
            <li v-for="project in recentProjects" :key="project" @click="openRecentProject(project)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span>{{ getProjectName(project) }}</span>
            </li>
          </ul>
        </div>
        
        <p v-if="projectStore.error" class="error-message">{{ projectStore.error }}</p>
        
        <p v-if="!isElectron" class="web-notice">
          提示：此功能需要在桌面应用中使用
        </p>
      </div>
    </div>

    <!-- 主界面 -->
    <template v-else>
      <AppHeader 
        @toggle-theme="uiStore.toggleTheme"
        @toggle-terminal="toggleTerminalVisibility"
        @toggle-sidebar="toggleSidebarPanel"
        @toggle-content="toggleContentPanel"
        @search="uiStore.setSearchQuery"
        @select-project="selectProject"
        :project-name="projectStore.projectName"
        :theme="uiStore.theme"
        :terminal-open="uiStore.terminalOpen && !uiStore.terminalCollapsed"
        :sidebar-visible="!uiStore.sidebarCollapsed"
        :content-visible="!uiStore.contentCollapsed"
      />
      <div class="main-content" ref="mainContentRef">
        <Sidebar 
          v-show="!uiStore.sidebarCollapsed"
          :width="uiStore.sidebarWidth"
          :search-query="uiStore.searchQuery"
          :changes-tree="projectStore.changesTree"
          :specs-tree="projectStore.specsTree"
          :other-tree="projectStore.otherTree"
          :is-loading="projectStore.isLoading"
          @select-file="handleFileSelect"
        />
        <ContentPanel 
          v-show="!uiStore.contentCollapsed"
          :file="projectStore.currentFile"
          :is-loading="projectStore.isLoading"
          @navigate-to-spec="navigateToSpec"
        />
        <TerminalPanel 
          v-if="uiStore.terminalOpen"
          v-show="!uiStore.terminalCollapsed"
          :width="uiStore.terminalWidth"
          :project-path="projectStore.projectPath"
          :is-main="uiStore.contentCollapsed"
          :collapsed="uiStore.terminalCollapsed"
          @close="toggleTerminal"
        />
        <div
          v-if="!uiStore.sidebarCollapsed"
          class="split-handle split-handle-left"
          :style="leftHandleStyle"
          @mousedown="startResize('sidebar', $event)"
        ></div>
        <div
          v-if="uiStore.terminalOpen && !uiStore.terminalCollapsed && !uiStore.contentCollapsed"
          class="split-handle split-handle-right"
          :style="rightHandleStyle"
          @mousedown="startResize('terminal', $event)"
        ></div>
      </div>
      <StatusBar 
        :project-path="projectStore.projectPath"
        :is-loading="projectStore.isLoading"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount } from 'vue'
import { useProjectStore } from './stores/project'
import { useUIStore } from './stores/ui'
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import ContentPanel from './components/ContentPanel.vue'
import StatusBar from './components/StatusBar.vue'
import TerminalPanel from './components/TerminalPanel.vue'

const projectStore = useProjectStore()
const uiStore = useUIStore()

const recentProjects = ref<string[]>([])
const isElectron = computed(() => projectStore.isElectron())
const mainContentRef = ref<HTMLElement | null>(null)

const leftHandleStyle = computed(() => ({ left: `${uiStore.sidebarWidth}px` }))
const rightHandleStyle = computed(() => ({ left: `calc(100% - ${uiStore.terminalWidth}px)` }))

const MIN_PANEL_WIDTH = 80
const MIN_CENTER_WIDTH = 100

let resizingTarget: 'sidebar' | 'terminal' | null = null
let resizingStartX = 0
let resizingStartWidth = 0
let resizingContainerWidth = 0

function startResize(target: 'sidebar' | 'terminal', event: MouseEvent) {
  resizingTarget = target
  resizingStartX = event.clientX
  resizingStartWidth = target === 'sidebar' ? uiStore.sidebarWidth : uiStore.terminalWidth
  resizingContainerWidth = mainContentRef.value?.clientWidth || window.innerWidth
  document.addEventListener('mousemove', doResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function doResize(event: MouseEvent) {
  if (!resizingTarget) return
  const containerWidth = resizingContainerWidth || mainContentRef.value?.clientWidth || window.innerWidth
  const terminalVisible = uiStore.terminalOpen && !uiStore.terminalCollapsed
  const contentVisible = !uiStore.contentCollapsed
  if (resizingTarget === 'sidebar') {
    const diff = event.clientX - resizingStartX
    const terminalReserve = terminalVisible && contentVisible ? uiStore.terminalWidth : 0
    const centerMin = contentVisible ? MIN_CENTER_WIDTH : (terminalVisible ? MIN_PANEL_WIDTH : 0)
    const maxWidth = Math.max(0, containerWidth - terminalReserve - centerMin)
    const minWidth = Math.min(MIN_PANEL_WIDTH, maxWidth)
    const nextWidth = Math.max(minWidth, Math.min(resizingStartWidth + diff, maxWidth))
    if (uiStore.sidebarCollapsed) uiStore.expandSidebar()
    uiStore.setSidebarWidth(nextWidth)
    return
  }
  const diff = resizingStartX - event.clientX
  const sidebarReserve = uiStore.sidebarCollapsed ? 0 : uiStore.sidebarWidth
  const maxWidth = Math.max(0, containerWidth - sidebarReserve - MIN_CENTER_WIDTH)
  const minWidth = Math.min(MIN_PANEL_WIDTH, maxWidth)
  const nextWidth = Math.max(minWidth, Math.min(resizingStartWidth + diff, maxWidth))
  if (!uiStore.terminalOpen) uiStore.toggleTerminal()
  if (uiStore.terminalCollapsed) uiStore.expandTerminal()
  uiStore.setTerminalWidth(nextWidth)
}

function stopResize() {
  resizingTarget = null
  resizingContainerWidth = 0
  document.removeEventListener('mousemove', doResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function toggleSidebarPanel() {
  if (uiStore.sidebarCollapsed) {
    uiStore.expandSidebar()
  } else {
    uiStore.toggleSidebarCollapsed()
  }
}

function toggleContentPanel() {
  if (uiStore.contentCollapsed) {
    uiStore.expandContent()
  } else {
    uiStore.collapseContent()
  }
}

onMounted(async () => {
  uiStore.initTheme()
  
  // 获取最近项目
  if (window.electronAPI) {
    recentProjects.value = await window.electronAPI.getRecentProjects()
  }
})

async function selectProject() {
  await projectStore.selectProject()
}

async function openRecentProject(path: string) {
  projectStore.projectPath = path
  projectStore.projectName = getProjectName(path)
  await projectStore.loadProject()
}

function getProjectName(path: string): string {
  return path.split(/[/\\]/).pop() || 'OpenSpec 项目'
}

function handleFileSelect(filePath: string) {
  projectStore.loadFile(filePath)
}

function toggleTerminal() {
  uiStore.toggleTerminal()
}

function toggleTerminalVisibility() {
  if (!uiStore.terminalOpen) {
    uiStore.toggleTerminal()
    return
  }
  if (uiStore.terminalCollapsed) {
    uiStore.expandTerminal()
  } else {
    uiStore.collapseTerminal()
  }
}

function navigateToSpec(specPath: string) {
  // 导航到规范文件
  projectStore.loadFile(specPath)
}

onBeforeUnmount(() => {
  stopResize()
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.split-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  z-index: 30;
  cursor: col-resize;
}

.split-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: var(--border-color);
  opacity: 0.6;
  pointer-events: none;
}

.split-handle:hover::after {
  opacity: 0.9;
}

/* 欢迎界面 */
.welcome-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg-primary);
}

.welcome-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.logo {
  color: var(--accent-color);
  margin-bottom: 20px;
}

.welcome-content h1 {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.subtitle {
  color: var(--text-secondary);
  margin: 0 0 32px 0;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  color: white;
  background: var(--accent-color);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.recent-projects {
  margin-top: 40px;
  text-align: left;
}

.recent-projects h3 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.recent-projects ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.recent-projects li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  transition: background 0.2s;
}

.recent-projects li:hover {
  background: var(--bg-hover);
}

.recent-projects li svg {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.recent-projects li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-message {
  color: var(--error-color);
  margin-top: 16px;
  font-size: 14px;
}

.web-notice {
  color: var(--text-secondary);
  margin-top: 24px;
  font-size: 13px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
}
</style>
