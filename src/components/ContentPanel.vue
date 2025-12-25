<template>
  <main class="content-panel">
    <div v-if="!file" class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>{{ isLoading ? '加载中...' : '选择一个文件查看内容' }}</p>
    </div>
    
    <div v-else class="content-wrapper">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      <div v-if="findVisible && !isEditorActive && file?.type !== 'image'" class="find-bar" @keydown.stop>
        <input
          ref="findInputRef"
          v-model="findQuery"
          class="find-input"
          type="text"
          placeholder="在文件中查找"
          @keydown.enter.prevent="handleFindEnter"
          @keydown.esc.prevent="closeFind"
        />
        <span class="find-count">{{ matchCountLabel }}</span>
        <button class="find-btn" type="button" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
        <button class="find-btn" type="button" title="下一个 (Enter)" @click="findNext">↓</button>
        <button class="find-btn" type="button" title="关闭 (Esc)" @click="closeFind">✕</button>
      </div>
      <div class="content-header">
        <div class="file-info">
          <span class="file-path">{{ normalizedPath }}</span>
          <h2>{{ file?.name }}</h2>
        </div>
        <button
          v-if="canToggleView"
          class="view-btn"
          type="button"
          :title="viewButtonTitle"
          @click="toggleViewMode"
        >{{ viewButtonLabel }}</button>
      </div>
      
    <div class="content-body" :class="{ 'is-editor': isEditorActive }" ref="contentBodyRef" @scroll="handleContentScroll">
        <div v-if="file?.type === 'image'" class="image-preview">
          <img :src="file.content" :alt="file.name" />
        </div>
        
        <div v-else-if="file?.type === 'task' && currentContentMode === 'task'" class="task-content">
          <!-- 顶部统计栏 -->
          <div class="task-dashboard-header">
            <div class="progress-overview">
              <div class="progress-ring-wrapper">
                <svg class="progress-ring" width="60" height="60">
                  <circle class="progress-ring-bg" stroke="var(--bg-tertiary)" stroke-width="4" fill="transparent" r="26" cx="30" cy="30"/>
                  <circle class="progress-ring-circle" stroke="var(--accent-color)" stroke-width="4" fill="transparent" r="26" cx="30" cy="30"
                    :style="{ strokeDasharray: `${2 * Math.PI * 26}`, strokeDashoffset: `${2 * Math.PI * 26 * (1 - progressPercent / 100)}` }" />
                </svg>
                <div class="progress-text-center">
                  <span class="percent">{{ progressPercent }}%</span>
                </div>
              </div>
              <div class="progress-stats">
                <div class="stat-item">
                  <span class="stat-value">{{ taskProgress.completed }}</span>
                  <span class="stat-label">已完成</span>
                </div>
                <div class="stat-divider">/</div>
                <div class="stat-item">
                  <span class="stat-value total">{{ taskProgress.total }}</span>
                  <span class="stat-label">总任务</span>
                </div>
              </div>
            </div>

            <div class="task-filters">
              <button class="filter-chip" :class="{ active: taskFilter === 'all' }" @click="taskFilter = 'all'">
                全部
              </button>
              <button class="filter-chip" :class="{ active: taskFilter === 'pending' }" @click="taskFilter = 'pending'">
                进行中 <span class="badge" v-if="taskProgress.total - taskProgress.completed > 0">{{ taskProgress.total - taskProgress.completed }}</span>
              </button>
              <button class="filter-chip" :class="{ active: taskFilter === 'completed' }" @click="taskFilter = 'completed'">
                已完成
              </button>
              <div class="filter-divider"></div>
              <button class="filter-chip filter-action" type="button" @click="expandAllGroups">
                展开全部
              </button>
              <button class="filter-chip filter-action" type="button" @click="collapseAllGroups">
                收起全部
              </button>
            </div>
          </div>
          
          <div class="task-board">
            <template v-for="group in groupedTasks" :key="group.id">
              <div class="task-group-card" v-if="group.tasks.length > 0">
                <div class="group-header" @click="toggleGroup(group.id)">
                  <div class="group-title">
                    <div class="group-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    </div>
                    <h3>{{ group.label }}</h3>
                  </div>
                  <div class="group-actions">
                    <div class="group-progress">
                      <span class="group-status">{{ group.tasks.filter(t => t.checked).length }}/{{ group.tasks.length }}</span>
                    </div>
                    <svg class="chevron-icon" :class="{ collapsed: collapsedGroups.has(group.id) }" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
                
                <div class="group-body" v-show="!collapsedGroups.has(group.id)">
                  <div v-for="task in group.tasks" :key="task.id" 
                       class="task-row" 
                       :class="{ completed: task.checked, 'has-indent': task.level > 0 }"
                       :style="{ paddingLeft: (task.level * 24 + 20) + 'px' }">
                    
                    <div class="task-checkbox-wrapper" @click="toggleTask(task)">
                      <div class="custom-checkbox" :class="{ checked: task.checked }">
                        <svg v-if="task.checked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>

                    <div class="task-content-wrapper">
                      <div class="task-main">
                        <textarea v-if="editingTaskId === task.id" ref="editInput" v-model="editingValue" class="task-edit-textarea" rows="2" @blur="saveTaskEdit(task)" @keyup.escape="cancelEdit" @keydown.ctrl.enter="saveTaskEdit(task)"></textarea>
                        <span v-else class="task-text" @dblclick="startEdit(task)">{{ task.label }}</span>
                        
                        <button v-if="editingTaskId !== task.id" class="task-edit-icon" @click.stop="startEdit(task)">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </div>
                      <div v-if="task.description" class="task-desc">{{ task.description }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="groupedTasks.length === 0" class="empty-filter-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="empty-icon">
                <circle cx="12" cy="12" r="10"/>
                <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
              <p>没有符合条件的任务</p>
            </div>
          </div>
        </div>
        
        <div v-else-if="currentContentMode === 'view'" class="view-content">
          <div v-if="file?.type === 'code'" class="code-content">
            <pre><code :class="'language-' + (file.fileType || 'text')" v-html="highlightedCode"></code></pre>
          </div>

          <div v-else-if="file?.type === 'text'" class="text-content">
            <pre><code class="language-text" v-html="highlightedCode"></code></pre>
          </div>

          <div v-else class="markdown-content" v-html="renderedContent"></div>
        </div>

        <div v-else class="editor-content">
          <FileEditor
            ref="fileEditorRef"
            :file="file!"
            :project-path="projectStore.projectPath"
            @save-status="saveStatus = $event"
            @saved="handleFileSaved"
          />
        </div>

        <div v-if="saveStatus" class="save-toast" :class="saveStatus">
          <svg v-if="saveStatus === 'saved'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else-if="saveStatus === 'saving'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          <span>{{ saveStatus === 'saving' ? '正在保存...' : saveStatus === 'saved' ? '保存成功' : '保存失败' }}</span>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import type { FileContent, TaskItem } from '../types'
import { useProjectStore } from '../stores/project'
import { isPerfEnabled, perfLog, perfNow } from '../utils/perf'
import FileEditor from './FileEditor.vue'

const props = defineProps<{
  storeKey: string
  file: FileContent | null
  isLoading: boolean
}>()
let projectStore = useProjectStore(props.storeKey)
watch(() => props.storeKey, (next) => {
  projectStore = useProjectStore(next)
})

const taskFilter = ref<'all' | 'pending' | 'completed'>('all')
const editingTaskId = ref<string | null>(null)
const editingValue = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)
const saveStatus = ref<'saving' | 'saved' | 'error' | null>(null)
const originalContent = ref('')
const taskScrollTop = ref(0)
const lastTaskPath = ref<string | null>(null)
const contentBodyRef = ref<HTMLElement | null>(null)
const collapsedGroups = ref(new Set<string>())
const renderedContent = ref('')
const highlightedCode = ref('')
const fileEditorRef = ref<{ openFind?: () => void } | null>(null)
const LARGE_FILE_THRESHOLD = 200_000
let markdownRenderToken = 0
let codeRenderToken = 0
const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback

const findVisible = ref(false)
const findQuery = ref('')
const matchPositions = ref<number[]>([])
const activeMatchIndex = ref(0)
const findInputRef = ref<HTMLInputElement | null>(null)
let findIndexToken = 0
const MAX_HIGHLIGHTS = 2000

const matchCountLabel = computed(() => {
  const total = matchPositions.value.length
  if (total === 0) return '0/0'
  if (total > MAX_HIGHLIGHTS) return `${activeMatchIndex.value + 1}/${total} (前${MAX_HIGHLIGHTS})`
  return `${activeMatchIndex.value + 1}/${total}`
})

type ContentMode = 'editor' | 'view' | 'task'
const viewModeOverrides = ref<Record<string, ContentMode>>({})

function getDefaultContentMode(file: FileContent): ContentMode {
  if (file.type === 'task') return 'task'
  return 'editor'
}

function getContentModeForFile(file: FileContent): ContentMode {
  const override = viewModeOverrides.value[file.path]
  if (override) return override
  return getDefaultContentMode(file)
}

const currentContentMode = computed<ContentMode>(() => {
  const f = props.file
  if (!f) return 'view'
  if (f.type === 'image') return 'view'
  return getContentModeForFile(f)
})

const isEditorActive = computed(() => currentContentMode.value === 'editor')

const canToggleView = computed(() => {
  const f = props.file
  if (!f) return false
  if (f.type === 'image') return false
  return true
})

const viewButtonLabel = computed(() => {
  const f = props.file
  if (!f) return 'View'
  if (f.type === 'task') return currentContentMode.value === 'task' ? 'View' : 'Task'
  return currentContentMode.value === 'view' ? 'Edit' : 'View'
})

const viewButtonTitle = computed(() => {
  const f = props.file
  if (!f) return '切换视图'
  if (f.type === 'task') {
    return currentContentMode.value === 'task' ? '切到编辑器（原文）' : '切回任务看板'
  }
  return currentContentMode.value === 'view' ? '切到编辑器' : '切到渲染视图'
})

function toggleViewMode() {
  const f = props.file
  if (!f || f.type === 'image') return
  const next: ContentMode =
    f.type === 'task'
      ? (currentContentMode.value === 'task' ? 'editor' : 'task')
      : (currentContentMode.value === 'view' ? 'editor' : 'view')

  viewModeOverrides.value = { ...viewModeOverrides.value, [f.path]: next }
}

watch(currentContentMode, (mode) => {
  if (!props.file) return
  if (props.file.type === 'image') return
  if (mode === 'editor') {
    findVisible.value = false
    clearHighlights()
    renderedContent.value = ''
    highlightedCode.value = ''
    return
  }
  scheduleRender(props.file)
  scheduleFindIndex()
})

watch(() => props.file, (newFile, oldFile) => {
  const nextPath = newFile?.path || null
  const prevPath = oldFile?.path || lastTaskPath.value
  const isTask = newFile?.type === 'task'
  const isSameFile = !!nextPath && !!prevPath && nextPath === prevPath
  if (!isTask || !isSameFile) {
    taskFilter.value = 'all'
    editingTaskId.value = null
    saveStatus.value = null
    collapsedGroups.value = new Set()
    if (isTask) {
      taskScrollTop.value = 0
    }
  }
  if (newFile && getContentModeForFile(newFile) === 'editor') {
    findVisible.value = false
  }
  if (newFile) {
    originalContent.value = newFile.content
  }
  scheduleRender(newFile)
  scheduleFindIndex()
  if (isTask) {
    lastTaskPath.value = nextPath
    nextTick(() => restoreTaskScroll())
  }
})

function restoreTaskScroll() {
  const container = contentBodyRef.value
  if (!container) return
  container.scrollTop = taskScrollTop.value
}

function captureTaskScroll() {
  const container = contentBodyRef.value
  if (!container) return
  taskScrollTop.value = container.scrollTop
}

function handleContentScroll() {
  if (props.file?.type !== 'task') return
  captureTaskScroll()
}

function handleFileSaved(content: string) {
  if (!props.file) return
  projectStore.currentFile = { ...props.file, content }
}

marked.setOptions({ breaks: true, gfm: true })

function scheduleRender(file: FileContent | null) {
  clearHighlights()
  if (!file) {
    renderedContent.value = ''
    highlightedCode.value = ''
    return
  }
  const mode = file.type === 'image' ? 'view' : getContentModeForFile(file)
  if (mode === 'editor') {
    renderedContent.value = ''
    highlightedCode.value = ''
    return
  }
  if (file.type === 'task') {
    renderedContent.value = ''
    highlightedCode.value = ''
    return
  }
  if (file.type === 'markdown') {
    scheduleMarkdownRender(file)
    highlightedCode.value = ''
    return
  }
  if (file.type === 'code') {
    scheduleCodeHighlight(file)
    renderedContent.value = ''
    return
  }
  if (file.type === 'text') {
    renderedContent.value = ''
    highlightedCode.value = escapeHtml(file.content)
    return
  }
  renderedContent.value = ''
  highlightedCode.value = ''
}

function openLegacyFind() {
  findVisible.value = true
  const selected = window.getSelection?.()?.toString() || ''
  if (selected && selected.length <= 80 && !selected.includes('\n') && !selected.includes('\r')) {
    findQuery.value = selected
  }
  nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
    scheduleFindIndex()
  })
}

function openFind() {
  if (props.file?.type === 'image') return
  if (isEditorActive.value) {
    fileEditorRef.value?.openFind?.()
    return
  }
  openLegacyFind()
}

function closeFind() {
  findVisible.value = false
  matchPositions.value = []
  activeMatchIndex.value = 0
  clearHighlights()
}

function handleFindEnter(event: KeyboardEvent) {
  if (event.shiftKey) {
    findPrev()
    return
  }
  findNext()
}

function getContentText(): string {
  return contentBodyRef.value?.textContent || ''
}

function scheduleFindIndex() {
  if (!findVisible.value) return
  const token = ++findIndexToken
  const run = () => {
    if (token !== findIndexToken) return
    const shouldKeepFocus = document.activeElement === findInputRef.value
    const q = findQuery.value
    if (!q) {
      matchPositions.value = []
      activeMatchIndex.value = 0
      clearHighlights()
      return
    }
    const text = getContentText()
    const queryLower = q.toLowerCase()
    const textLower = text.toLowerCase()
    const positions: number[] = []
    let idx = 0
    while (positions.length < 10_000) {
      idx = textLower.indexOf(queryLower, idx)
      if (idx === -1) break
      positions.push(idx)
      idx += Math.max(1, queryLower.length)
    }
    matchPositions.value = positions
    if (positions.length === 0) {
      activeMatchIndex.value = 0
      return
    }
    if (activeMatchIndex.value >= positions.length) {
      activeMatchIndex.value = 0
    }
    // 输入过程中只更新高亮，不强制滚动
    applyHighlights(activeMatchIndex.value)
    if (shouldKeepFocus) focusFindInput()
  }
  if (typeof requestIdle === 'function') {
    requestIdle(run, { timeout: 120 })
  } else {
    window.setTimeout(run, 0)
  }
}

watch(findQuery, () => {
  activeMatchIndex.value = 0
  scheduleFindIndex()
})

watch([renderedContent, highlightedCode], () => {
  scheduleFindIndex()
})

function selectMatch(index: number) {
  const root = contentBodyRef.value
  if (!root) return
  const positions = matchPositions.value
  if (positions.length === 0) return
  applyHighlights(index)
  const start = positions[index]
  const end = start + findQuery.value.length
  const range = createRangeFromOffsets(root, start, end)
  const highlightRect = range ? getRangePrimaryRect(range) : null

  // 只在“看不见”时才调整横向滚动条（对齐 IDE 体验）
  const prevScrollLeft = root.scrollLeft
  const rangeRect = highlightRect
  const containerRect = root.getBoundingClientRect()
  if (rangeRect) {
    // 纵向：居中显示，避免 scrollIntoView 影响横向滚动条
    const targetTop = root.scrollTop + (rangeRect.top - containerRect.top) - (containerRect.height / 2 - rangeRect.height / 2)
    root.scrollTop = clamp(targetTop, 0, root.scrollHeight - root.clientHeight)

    // 横向：只有超出当前可视宽度才滚动
    const padding = 24
    if (rangeRect.left < containerRect.left) {
      const delta = (containerRect.left - rangeRect.left) + padding
      root.scrollLeft = Math.max(0, prevScrollLeft - delta)
    } else if (rangeRect.right > containerRect.right) {
      const delta = (rangeRect.right - containerRect.right) + padding
      root.scrollLeft = Math.min(root.scrollWidth - root.clientWidth, prevScrollLeft + delta)
    } else {
      root.scrollLeft = prevScrollLeft
    }
  }
}

function canUseCssHighlights(): boolean {
  const cssAny = (window as any).CSS
  const HighlightCtor = (window as any).Highlight
  return !!cssAny?.highlights && typeof HighlightCtor === 'function'
}

function clearHighlights() {
  const cssAny = (window as any).CSS
  if (!cssAny?.highlights) return
  cssAny.highlights.delete('find-candidate')
  cssAny.highlights.delete('find-active')
}

function applyHighlights(activeIndex: number) {
  const root = contentBodyRef.value
  if (!root) return
  clearHighlights()
  if (!findVisible.value) return
  const q = findQuery.value
  const positions = matchPositions.value
  if (!q || positions.length === 0) return
  if (!canUseCssHighlights()) return

  const cssAny = (window as any).CSS
  const HighlightCtor = (window as any).Highlight
  const candidateHighlight = new HighlightCtor()
  const limit = Math.min(positions.length, MAX_HIGHLIGHTS)
  for (let i = 0; i < limit; i++) {
    const start = positions[i]
    const end = start + q.length
    const range = createRangeFromOffsets(root, start, end)
    if (range) candidateHighlight.add(range)
  }
  cssAny.highlights.set('find-candidate', candidateHighlight)

  const activeStart = positions[activeIndex]
  const activeRange = createRangeFromOffsets(root, activeStart, activeStart + q.length)
  if (activeRange) {
    const activeHighlight = new HighlightCtor()
    activeHighlight.add(activeRange)
    cssAny.highlights.set('find-active', activeHighlight)
  }
}

function focusFindInput() {
  if (!findVisible.value) return
  const input = findInputRef.value
  if (!input) return
  input.focus()
  // 让用户能继续输入（IDE 通常把光标放在末尾）
  const len = input.value.length
  input.setSelectionRange(len, len)
}

function createRangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const len = node.data.length
    if (!startNode && currentOffset + len >= start) {
      startNode = node
      startOffset = Math.max(0, start - currentOffset)
    }
    if (currentOffset + len >= end) {
      endNode = node
      endOffset = Math.max(0, end - currentOffset)
      break
    }
    currentOffset += len
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

function getRangePrimaryRect(range: Range): DOMRect | null {
  const rects = range.getClientRects()
  if (rects && rects.length > 0) return rects[0]
  const rect = range.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return null
  return rect
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function findNext() {
  if (!findVisible.value) openFind()
  if (matchPositions.value.length === 0) {
    scheduleFindIndex()
    return
  }
  activeMatchIndex.value = (activeMatchIndex.value + 1) % matchPositions.value.length
  selectMatch(activeMatchIndex.value)
  focusFindInput()
}

function findPrev() {
  if (!findVisible.value) openFind()
  if (matchPositions.value.length === 0) {
    scheduleFindIndex()
    return
  }
  activeMatchIndex.value = (activeMatchIndex.value - 1 + matchPositions.value.length) % matchPositions.value.length
  selectMatch(activeMatchIndex.value)
  focusFindInput()
}

defineExpose({ openFind })

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function scheduleMarkdownRender(file: FileContent) {
  const token = ++markdownRenderToken
  renderedContent.value = ''
  const perfEnabled = isPerfEnabled()
  const run = () => {
    if (token !== markdownRenderToken) return
    const start = perfEnabled ? perfNow() : 0
    const result = marked(file.content)
    renderedContent.value = result
    if (perfEnabled) {
      const durationMs = perfNow() - start
      perfLog('markdown.render', {
        path: file.path,
        bytes: file.content.length,
        durationMs: Math.round(durationMs * 1000) / 1000,
        deferred: true
      })
    }
  }
  if (typeof requestIdle === 'function') {
    requestIdle(run, { timeout: 400 })
  } else {
    window.setTimeout(run, file.content.length > LARGE_FILE_THRESHOLD ? 60 : 0)
  }
}

function scheduleCodeHighlight(file: FileContent) {
  const token = ++codeRenderToken
  highlightedCode.value = ''
  const lang = file.fileType || 'text'
  const perfEnabled = isPerfEnabled()
  const run = () => {
    if (token !== codeRenderToken) return
    const start = perfEnabled ? perfNow() : 0
    if (file.content.length > LARGE_FILE_THRESHOLD) {
      highlightedCode.value = escapeHtml(file.content)
      if (perfEnabled) {
        const durationMs = perfNow() - start
        perfLog('code.highlight', {
          path: file.path,
          language: lang,
          bytes: file.content.length,
          durationMs: Math.round(durationMs * 1000) / 1000,
          skipped: 'large-file'
        })
      }
      return
    }
    if (hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(file.content, { language: lang }).value
        highlightedCode.value = result
        if (perfEnabled) {
          const durationMs = perfNow() - start
          perfLog('code.highlight', {
            path: file.path,
            language: lang,
            bytes: file.content.length,
            durationMs: Math.round(durationMs * 1000) / 1000
          })
        }
        return
      } catch {}
    }
    highlightedCode.value = escapeHtml(file.content)
    if (perfEnabled) {
      const durationMs = perfNow() - start
      perfLog('code.highlight', {
        path: file.path,
        language: lang,
        bytes: file.content.length,
        durationMs: Math.round(durationMs * 1000) / 1000,
        fallback: true
      })
    }
  }
  if (typeof requestIdle === 'function') {
    requestIdle(run, { timeout: 400 })
  } else {
    window.setTimeout(run, 0)
  }
}

const taskList = computed<TaskItem[]>(() => {
  if (!props.file || props.file.type !== 'task') return []
  return projectStore.parseTaskList(originalContent.value)
})

const filteredTaskList = computed(() => {
  // 基础过滤，不包含章节
  let tasks = taskList.value
  
  // 如果是按状态筛选，我们先保留所有章节，然后在分组时过滤任务
  if (taskFilter.value !== 'all') {
    // 这里我们返回完整列表，在分组逻辑中处理筛选
    return tasks
  }
  return tasks
})

// 分组逻辑
const groupedTasks = computed(() => {
  const groups: { id: string; label: string; tasks: TaskItem[] }[] = []
  let currentGroup = { id: 'default', label: 'General', tasks: [] as TaskItem[] }
  
  taskList.value.forEach(task => {
    if (task.isSection) {
      if (currentGroup.tasks.length > 0 || (currentGroup.label !== 'General' && taskFilter.value === 'all')) {
        groups.push(currentGroup)
      }
      currentGroup = { id: task.id, label: task.label, tasks: [] }
    } else {
      // 应用筛选逻辑
      let shouldInclude = true
      if (taskFilter.value === 'completed' && !task.checked) shouldInclude = false
      if (taskFilter.value === 'pending' && task.checked) shouldInclude = false
      
      if (shouldInclude) {
        currentGroup.tasks.push(task)
      }
    }
  })
  
  // Push last group
  if (currentGroup.tasks.length > 0 || (currentGroup.label !== 'General' && taskFilter.value === 'all')) {
    groups.push(currentGroup)
  }
  
  // 如果有筛选，只返回有任务的组
  if (taskFilter.value !== 'all') {
    return groups.filter(g => g.tasks.length > 0)
  }
  
  return groups
})

const collapsibleGroupIds = computed(() => {
  return groupedTasks.value.filter(g => g.tasks.length > 0).map(g => g.id)
})

function expandAllGroups() {
  collapsedGroups.value = new Set()
}

function collapseAllGroups() {
  collapsedGroups.value = new Set(collapsibleGroupIds.value)
}

const taskProgress = computed(() => {
  const tasks = taskList.value.filter(t => !t.isSection)
  const completed = tasks.filter(t => t.checked).length
  return { completed, total: tasks.length }
})

const progressPercent = computed(() => {
  if (taskProgress.value.total === 0) return 0
  return Math.round((taskProgress.value.completed / taskProgress.value.total) * 100)
})

const normalizedPath = computed(() => {
  if (!props.file?.path) return ''
  return props.file.path.replace(/\\/g, '/')
})

function startEdit(task: TaskItem) {
  editingTaskId.value = task.id
  editingValue.value = task.label
  nextTick(() => { editInput.value?.focus(); editInput.value?.select() })
}

function cancelEdit() { editingTaskId.value = null; editingValue.value = '' }

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, (match) => '\\' + match)
}

function toggleGroup(groupId: string) {
  const newSet = new Set(collapsedGroups.value)
  if (newSet.has(groupId)) {
    newSet.delete(groupId)
  } else {
    newSet.add(groupId)
  }
  collapsedGroups.value = newSet
}

// 简单的 toggleTask，用于点击 Checkbox 切换状态
function toggleTask(task: TaskItem) {
  if (editingTaskId.value === task.id) return
  
  // 构建新的 label：[x] <-> [ ]
  // 这里我们需要更精确地定位并修改原始文本
  // 实际上最简单的方法是复用 saveTaskEdit 的逻辑，但我们需要先修改 content
  
  // 找到原始行
  const oldLabel = task.label
  const escaped = escapeRegex(oldLabel)
  // 匹配 [ ] 或 [x]
  const regex = new RegExp(`(^\\s*-\\s*\\[)([ xX])(\\]\\s*)${escaped}`, 'm')
  const match = originalContent.value.match(regex)
  
  if (match) {
    const newStatus = task.checked ? ' ' : 'x' // 反转
    const newContent = originalContent.value.replace(regex, `$1${newStatus}$3${oldLabel}`)
    
    // 保存
    saveContent(newContent, task, oldLabel) // 注意：这里 label 没变，只是 status 变了，但 parseTaskList 会重新解析
  }
}

// 复用保存逻辑
async function saveContent(newContent: string, task: TaskItem, newLabel: string) {
  if (newContent === originalContent.value) { cancelEdit(); return }
  
  saveStatus.value = 'saving'
  try {
    if (window.electronAPI && props.file) {
      const fullPath = `${projectStore.projectPath}/${props.file.path}`
      const result = await window.electronAPI.saveFile(fullPath, newContent)
      if (result.success) {
        originalContent.value = newContent
        task.label = newLabel
        saveStatus.value = 'saved'
        setTimeout(() => { saveStatus.value = null }, 2000)
      } else { saveStatus.value = 'error'; setTimeout(() => { saveStatus.value = null }, 3000) }
    }
  } catch { saveStatus.value = 'error'; setTimeout(() => { saveStatus.value = null }, 3000) }
}

async function saveTaskEdit(task: TaskItem) {
  if (!editingValue.value.trim() || editingValue.value === task.label) { cancelEdit(); return }
  const newLabel = editingValue.value.trim().replace(/[\r\n]+/g, ' ')
  if (newLabel === task.label) { cancelEdit(); return }
  
  const oldLabel = task.label
  const escaped = escapeRegex(oldLabel)
  const regex = new RegExp(`(^\\s*-\\s*\\[[ xX]\\]\\s*)${escaped}`, 'm')
  const newContent = originalContent.value.replace(regex, `$1${newLabel}`)
  
  await saveContent(newContent, task, newLabel)
  cancelEdit()
}
</script>

<style scoped>
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-app); position: relative; min-width: 0; }
.empty-state, .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 12px; }
.empty-state svg { margin-bottom: 16px; opacity: 0.5; }
.empty-state p { margin: 0; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.content-wrapper { display: flex; flex-direction: column; height: 100%; position: relative; }

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(1px);
  color: var(--text-secondary);
  font-size: 13px;
  z-index: 10;
}

.find-bar {
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 20;
}

.find-input {
  width: 220px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  font-size: 13px;
}

.find-input:focus {
  border-color: var(--accent-color);
}

.find-count {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 52px;
  text-align: right;
}

.find-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.find-btn:hover {
  background: var(--bg-hover);
}

:global(::highlight(find-candidate)) {
  background: rgba(255, 214, 10, 0.45);
}

:global(::highlight(find-active)) {
  background: rgba(33, 150, 243, 0.35);
}

:global(.dark-theme ::highlight(find-candidate)) {
  background: rgba(255, 214, 10, 0.25);
}

:global(.dark-theme ::highlight(find-active)) {
  background: rgba(79, 195, 247, 0.28);
}

.dark-theme .loading-overlay {
  background: rgba(18, 18, 18, 0.55);
}
.content-header { padding: 16px 32px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.file-info { display: flex; flex-direction: column; gap: 4px; }
.file-path { font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px; }
.content-header h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text-primary); }

.view-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.view-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.view-btn:active { background: var(--bg-tertiary); }

.content-body { flex: 1; overflow: auto; padding: 32px; }
.content-body.is-editor { padding: 0; overflow: hidden; }

.editor-content { height: 100%; }

.code-content {
  width: max-content;
  min-width: 100%;
}

.text-content {
  width: max-content;
  min-width: 100%;
}

/* 横向滚动条放在 content-body（视口底部），不要挂在 <pre> 上 */
.code-content pre {
  overflow-x: visible;
}

.text-content pre {
  overflow-x: visible;
}

.code-content code,
.markdown-content code {
  white-space: pre;
}

.markdown-content pre {
  overflow-x: auto;
}
.image-preview { display: flex; align-items: center; justify-content: center; min-height: 200px; }
.image-preview img { max-width: 100%; max-height: 80vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

/* Task Dashboard Styles */
/* 对齐 IDE：任务清单区域不随面板变窄而缩小，改用横向滚动条 */
.task-content { width: 1000px; min-width: 1000px; margin: 0 auto; position: relative; }

.task-dashboard-header { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  margin-bottom: 32px; 
  background: var(--bg-card); 
  padding: 20px 24px; 
  border-radius: 16px; 
  box-shadow: 0 2px 12px rgba(0,0,0,0.03); 
  border: 1px solid rgba(0,0,0,0.04);
  gap: 16px;
  flex-wrap: wrap;
}

.progress-overview { display: flex; align-items: center; gap: 24px; flex: 1 1 auto; min-width: 260px; }
.progress-ring-wrapper { position: relative; width: 60px; height: 60px; }
.progress-ring { transform: rotate(-90deg); }
.progress-text-center { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.percent { font-size: 14px; font-weight: 700; color: var(--text-primary); }

.progress-stats { display: flex; align-items: baseline; gap: 8px; }
.stat-item { display: flex; flex-direction: column; align-items: flex-start; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--accent-color); line-height: 1; }
.stat-value.total { color: var(--text-primary); }
.stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.stat-divider { font-size: 20px; color: var(--border-color); font-weight: 300; }

.task-filters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
.filter-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  opacity: 0.6;
  align-self: center;
  margin: 0 4px;
}
.filter-chip.filter-action {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.filter-chip.filter-action:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.filter-chip { 
  padding: 8px 16px; 
  border-radius: 20px; 
  border: 1px solid transparent; 
  background: var(--bg-secondary); 
  color: var(--text-secondary); 
  font-size: 13px; 
  font-weight: 500; 
  cursor: pointer; 
  transition: all 0.2s; 
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-chip:hover { background: var(--bg-tertiary); }
.filter-chip.active { background: var(--accent-color); color: white; box-shadow: 0 4px 12px rgba(var(--accent-color-rgb), 0.2); }
.filter-chip .badge { 
  background: rgba(0,0,0,0.1); 
  padding: 2px 6px; 
  border-radius: 10px; 
  font-size: 11px; 
  line-height: 1;
}
.filter-chip.active .badge { background: rgba(255,255,255,0.2); }

/* Task Board */
.task-board { display: flex; flex-direction: column; gap: 24px; padding-bottom: 60px; }

.task-group-card { 
  background: var(--bg-card); 
  border-radius: 16px; 
  box-shadow: 0 4px 20px rgba(0,0,0,0.03); 
  border: 1px solid rgba(0,0,0,0.04); 
  overflow: hidden; 
  transition: transform 0.2s;
}
.task-group-card:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.06); }

.group-header { 
  padding: 18px 24px; 
  background: var(--bg-card); 
  border-bottom: 1px solid var(--border-color); 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  cursor: pointer;
  user-select: none;
}
.group-header:hover { background: var(--bg-secondary); }
.group-title { display: flex; align-items: center; gap: 10px; }
.group-icon { color: var(--accent-color); opacity: 0.8; display: flex; }
.group-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
.group-actions { display: flex; align-items: center; gap: 12px; }
.group-status { font-size: 13px; color: var(--text-secondary); font-family: monospace; background: var(--bg-secondary); padding: 4px 8px; border-radius: 6px; }
.chevron-icon { color: var(--text-secondary); transition: transform 0.3s ease; }
.chevron-icon.collapsed { transform: rotate(-90deg); }

.group-body { display: flex; flex-direction: column; transition: all 0.3s ease; }

.task-row { 
  display: flex; 
  padding: 14px 24px; 
  border-bottom: 1px solid var(--border-color); 
  transition: background 0.15s; 
}
.task-row:last-child { border-bottom: none; }
.task-row:hover { background: var(--bg-hover); }

.task-row.completed { background: var(--bg-secondary); }
.task-row.completed:hover { background: var(--bg-tertiary); }
.task-row.completed .task-text { color: var(--text-secondary); text-decoration: none; opacity: 0.9; }
.task-row.completed .task-desc { color: var(--text-tertiary); opacity: 0.7; }

.task-checkbox-wrapper { padding-top: 2px; cursor: pointer; margin-right: 16px; }
.custom-checkbox { 
  width: 20px; 
  height: 20px; 
  border: 2px solid var(--border-color); 
  border-radius: 6px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  transition: all 0.2s; 
  color: white;
}
.task-row:hover .custom-checkbox { border-color: var(--accent-color); }
.custom-checkbox.checked { background: var(--success-color); border-color: var(--success-color); }

.task-content-wrapper { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.task-main { display: flex; align-items: flex-start; justify-content: space-between; }
.task-text { font-size: 15px; line-height: 1.5; color: var(--text-primary); cursor: text; transition: color 0.2s; }
.task-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-top: 2px; }

.task-edit-icon { opacity: 0; color: var(--text-tertiary); background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s; }
.task-row:hover .task-edit-icon { opacity: 1; }
.task-edit-icon:hover { background: var(--bg-tertiary); color: var(--accent-color); }

.task-edit-textarea { width: 100%; padding: 8px; border: 2px solid var(--accent-color); border-radius: 6px; font-family: inherit; font-size: 14px; line-height: 1.5; resize: vertical; }

.empty-filter-state { text-align: center; padding: 60px 0; color: var(--text-secondary); }
.empty-icon { margin-bottom: 16px; opacity: 0.3; color: var(--text-secondary); }

.save-toast { 
  position: fixed; 
  bottom: 40px; 
  right: 40px; 
  background: var(--bg-card); 
  padding: 10px 20px; 
  border-radius: 50px; 
  box-shadow: 0 4px 16px rgba(0,0,0,0.1); 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  font-size: 14px; 
  font-weight: 500; 
  z-index: 1000;
  animation: slideUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.save-toast.saved { color: var(--success-color); }
.save-toast.error { color: #dc3545; }
.save-toast .spin { animation: spin 1s linear infinite; }

/* Markdown Styles */
.code-content { background: var(--bg-secondary); border-radius: 8px; overflow: hidden; }
.code-content pre { margin: 0; padding: 16px; overflow-x: auto; }
.code-content code { font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.5; }
.markdown-content {
  width: max-content;
  min-width: 100%;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
  margin: 0;
}

/* 对齐 IDE：内容区不因面板变窄而重排，改为横向滚动 */
.markdown-content,
.markdown-content :deep(p),
.markdown-content :deep(li),
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(blockquote),
.markdown-content :deep(td),
.markdown-content :deep(th) {
  word-break: keep-all;
  overflow-wrap: normal;
}
.markdown-content :deep(h1), .markdown-content :deep(h2), .markdown-content :deep(h3) { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
.markdown-content :deep(h1) { font-size: 28px; }
.markdown-content :deep(h2) { font-size: 24px; }
.markdown-content :deep(h3) { font-size: 20px; }
.markdown-content :deep(p) { margin: 0 0 16px 0; }
.markdown-content :deep(ul), .markdown-content :deep(ol) { margin: 0 0 16px 0; padding-left: 24px; }
.markdown-content :deep(li) { margin-bottom: 8px; }
.markdown-content :deep(code) { padding: 2px 6px; background: var(--bg-secondary); border-radius: 4px; font-family: 'Consolas', monospace; font-size: 14px; }
.markdown-content :deep(pre) { margin: 0 0 16px 0; padding: 16px; background: var(--bg-secondary); border-radius: 8px; overflow-x: auto; }
.markdown-content :deep(pre code) { padding: 0; background: transparent; }
.markdown-content :deep(table) { width: max-content; min-width: 100%; margin: 0 0 16px 0; border-collapse: collapse; }
.markdown-content :deep(th), .markdown-content :deep(td) { padding: 10px 12px; border: 1px solid var(--border-color); text-align: left; }
.markdown-content :deep(th) { background: var(--bg-secondary); font-weight: 600; }
.markdown-content :deep(blockquote) { margin: 0 0 16px 0; padding: 12px 16px; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); }
.markdown-content :deep(a) { color: var(--accent-color); text-decoration: none; }
.markdown-content :deep(a:hover) { text-decoration: underline; }
</style>
