<template>
  <main class="content-panel">
    <div v-if="!file && !isLoading" class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>选择一个文件查看内容</p>
    </div>
    
    <div v-else-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>
    
    <div v-if="file && !isLoading" class="content-wrapper">
      <div class="content-header">
        <div class="file-info">
          <span class="file-path">{{ normalizedPath }}</span>
        </div>
        <h2>{{ file?.name }}</h2>
      </div>
      
      <div class="content-body">
        <div v-if="file?.type === 'image'" class="image-preview">
          <img :src="file.content" :alt="file.name" />
        </div>
        
        <div v-else-if="file?.type === 'task'" class="task-content">
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
          
          <div v-if="saveStatus" class="save-toast" :class="saveStatus">
            <svg v-if="saveStatus === 'saved'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else-if="saveStatus === 'saving'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>{{ saveStatus === 'saving' ? '正在保存...' : saveStatus === 'saved' ? '保存成功' : '保存失败' }}</span>
          </div>
        </div>
        
        <div v-else-if="file?.type === 'code'" class="code-content">
          <pre><code :class="'language-' + (file.fileType || 'text')" v-html="highlightedCode"></code></pre>
        </div>
        
        <div v-else class="markdown-content" v-html="renderedContent"></div>
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

const props = defineProps<{
  file: FileContent | null
  isLoading: boolean
}>()
const projectStore = useProjectStore()

const taskFilter = ref<'all' | 'pending' | 'completed'>('all')
const editingTaskId = ref<string | null>(null)
const editingValue = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)
const saveStatus = ref<'saving' | 'saved' | 'error' | null>(null)
const originalContent = ref('')
const collapsedGroups = ref(new Set<string>())

watch(() => props.file, (newFile) => {
  taskFilter.value = 'all'
  editingTaskId.value = null
  saveStatus.value = null
  collapsedGroups.value.clear()
  if (newFile) originalContent.value = newFile.content
})

marked.setOptions({ breaks: true, gfm: true })

const renderedContent = computed(() => {
  if (!props.file || props.file.type !== 'markdown') return ''
  if (!isPerfEnabled()) return marked(props.file.content)
  const start = perfNow()
  const result = marked(props.file.content)
  const durationMs = perfNow() - start
  perfLog('markdown.render', {
    path: props.file.path,
    bytes: props.file.content.length,
    durationMs: Math.round(durationMs * 1000) / 1000
  })
  return result
})

const highlightedCode = computed(() => {
  if (!props.file || props.file.type !== 'code') return ''
  const lang = props.file.fileType || 'text'
  const perfEnabled = isPerfEnabled()
  const start = perfEnabled ? perfNow() : 0
  if (hljs.getLanguage(lang)) {
    try {
      const result = hljs.highlight(props.file.content, { language: lang }).value
      if (perfEnabled) {
        const durationMs = perfNow() - start
        perfLog('code.highlight', {
          path: props.file.path,
          language: lang,
          bytes: props.file.content.length,
          durationMs: Math.round(durationMs * 1000) / 1000
        })
      }
      return result
    } catch {}
  }
  if (perfEnabled) {
    const durationMs = perfNow() - start
    perfLog('code.highlight', {
      path: props.file.path,
      language: lang,
      bytes: props.file.content.length,
      durationMs: Math.round(durationMs * 1000) / 1000,
      fallback: true
    })
  }
  return props.file.content
})

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
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-app); position: relative; }
.empty-state, .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 12px; }
.empty-state svg { margin-bottom: 16px; opacity: 0.5; }
.empty-state p { margin: 0; font-size: 14px; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.content-wrapper { display: flex; flex-direction: column; height: 100%; }
.content-header { padding: 16px 32px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.file-path { font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px; }
.content-header h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--text-primary); }

.content-body { flex: 1; overflow-y: auto; padding: 32px; }
.image-preview { display: flex; align-items: center; justify-content: center; min-height: 200px; }
.image-preview img { max-width: 100%; max-height: 80vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

/* Task Dashboard Styles */
.task-content { max-width: 1000px; margin: 0 auto; position: relative; }

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
}

.progress-overview { display: flex; align-items: center; gap: 24px; }
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

.task-filters { display: flex; gap: 8px; }
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
.markdown-content { max-width: 800px; font-size: 15px; line-height: 1.7; color: var(--text-primary); margin: 0 auto; }
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
.markdown-content :deep(table) { width: 100%; margin: 0 0 16px 0; border-collapse: collapse; }
.markdown-content :deep(th), .markdown-content :deep(td) { padding: 10px 12px; border: 1px solid var(--border-color); text-align: left; }
.markdown-content :deep(th) { background: var(--bg-secondary); font-weight: 600; }
.markdown-content :deep(blockquote) { margin: 0 0 16px 0; padding: 12px 16px; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); }
.markdown-content :deep(a) { color: var(--accent-color); text-decoration: none; }
.markdown-content :deep(a:hover) { text-decoration: underline; }
</style>
