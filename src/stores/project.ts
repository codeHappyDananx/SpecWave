import { defineStore, type StoreDefinition } from 'pinia'
import { ref, computed } from 'vue'
import type { TreeNode, FileContent, TaskItem } from '../types'
import { isPerfEnabled, perfLog, perfNow } from '../utils/perf'

type AnyStoreDefinition = StoreDefinition<string, any, any, any>
const projectStoreDefinitions = new Map<string, AnyStoreDefinition>()

function createProjectStore(storeKey: string) {
  return defineStore(`project:${storeKey}`, () => {
  // 状态
  const projectPath = ref<string>('')
  const projectName = ref<string>('')
  const isOpenSpec = ref(false)
  const changesTree = ref<TreeNode[]>([])
  const specsTree = ref<TreeNode[]>([])
  const otherTree = ref<TreeNode[]>([])
  const currentFile = ref<FileContent | null>(null)
  const isLoading = ref(false)
  const isBackgroundLoading = ref(false)
  const error = ref<string>('')
  const openspecBasePath = ref('')
  const isFullTreeLoaded = ref(false)
  const otherTreeVisible = ref(false)
  const INITIAL_TREE_DEPTH = 5
  const FULL_TREE_LOAD_DELAY_MS = 80
  const FILE_CHANGE_DEBOUNCE_MS = 1000
  const TASK_PROGRESS_INITIAL_BATCH = 25
  const TASK_PROGRESS_CONCURRENCY = 4
  const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  let loadToken = 0
  let fullLoadTimer: number | null = null
  let reloadTimer: number | null = null
  let currentFileReloadTimer: number | null = null
  let fileChangeListenerBound = false
  let removeFileChangeListener: (() => void) | null = null
  let watchedPath = ''
  const taskProgressCache = new Map<string, { completed: number; total: number }>()
  const taskProgressPending = new Set<string>()
  const pendingTaskProgressUpdates: Array<{ node: TreeNode; progress: { completed: number; total: number } }> = []
  let taskProgressFlushPending = false
  let otherTreeCache: TreeNode[] = []

  // 计算属性
  const hasProject = computed(() => !!projectPath.value)
  
  const allNodes = computed(() => {
    const nodes: TreeNode[] = []
    
    // OpenSpec 项目显示 Changes 和 Specs
    if (changesTree.value.length > 0) {
      nodes.push({
        id: 'changes',
        name: 'Changes',
        type: 'folder',
        path: 'changes',
        children: changesTree.value,
        isExpanded: true
      })
    }
    if (specsTree.value.length > 0) {
      nodes.push({
        id: 'specs',
        name: 'Specs',
        type: 'folder',
        path: 'specs',
        children: specsTree.value,
        isExpanded: true
      })
    }
    
    // 其他文件
    if (otherTree.value.length > 0) {
      for (const item of otherTree.value) {
        nodes.push(item)
      }
    }
    
    return nodes
  })

  // 检查是否在 Electron 环境
  function isElectron(): boolean {
    return !!window.electronAPI
  }

  // 选择项目目录
  async function selectProject(): Promise<boolean> {
    if (!isElectron()) {
      error.value = '此功能仅在桌面应用中可用'
      return false
    }

    try {
      isLoading.value = true
      error.value = ''
      
      const result = await window.electronAPI!.selectDirectory()
      
      if (!result.success) {
        if (result.error) {
          error.value = result.error
        }
        return false
      }

      projectPath.value = result.path!
      projectName.value = result.path!.split(/[/\\]/).pop() || 'Project'
      isOpenSpec.value = result.isOpenSpec || false
      
      await loadProject()
      return true
    } catch (err: any) {
      error.value = err.message || '选择项目失败'
      return false
    } finally {
      isLoading.value = false
    }
  }

  function normalizePath(value: string): string {
    return value.replace(/\\/g, '/')
  }

  function scheduleIdle(task: () => void) {
    if (typeof requestIdle === 'function') {
      requestIdle(task, { timeout: 200 })
      return
    }
    window.setTimeout(task, 0)
  }

  async function readDirectoryWithDepth(dirPath: string, maxDepth: number | null) {
    if (!window.electronAPI) return { success: false, items: [] as TreeNode[] }
    if (maxDepth === null) {
      return window.electronAPI.readDirectory(dirPath)
    }
    return window.electronAPI.readDirectoryDepth(dirPath, maxDepth)
  }

  async function openProject(dirPath: string): Promise<void> {
    projectPath.value = dirPath
    projectName.value = dirPath.split(/[/\\]/).pop() || 'Project'
    isOpenSpec.value = false
    await loadProject({ reason: 'open-project' })
  }

  async function resolveOpenSpecBase(): Promise<string> {
    const openspecSubdir = `${projectPath.value}/openspec`
    const openspecCheck = await readDirectoryWithDepth(openspecSubdir, 1)
    if (openspecCheck.success && openspecCheck.items) {
      const hasChanges = openspecCheck.items.some(item => item.name === 'changes')
      const hasSpecs = openspecCheck.items.some(item => item.name === 'specs')
      if (hasChanges || hasSpecs) {
        return openspecSubdir
      }
    }
    return projectPath.value
  }

  async function readProjectTrees(openspecBase: string, maxDepth: number | null, includeOther: boolean) {
    const changesPath = `${openspecBase}/changes`
    const specsPath = `${openspecBase}/specs`
    const readDirectory = (dirPath: string) => readDirectoryWithDepth(dirPath, maxDepth)

    const changesResult = await readDirectory(changesPath)
    const specsResult = await readDirectory(specsPath)
    const rootResult = includeOther ? await readDirectory(projectPath.value) : { success: true, items: [] as TreeNode[] }

    const changesPathPrefix = openspecBase === projectPath.value ? 'changes' : 'openspec/changes'
    const specsPathPrefix = openspecBase === projectPath.value ? 'specs' : 'openspec/specs'

    const nextChanges = changesResult.success && changesResult.items
      ? addPathPrefix(changesResult.items, changesPathPrefix)
      : []
    const nextSpecs = specsResult.success && specsResult.items
      ? addPathPrefix(specsResult.items, specsPathPrefix)
      : []
    const nextOther = rootResult.success && rootResult.items
      ? rootResult.items.filter(item =>
        item.name !== 'changes' && item.name !== 'specs' && item.name !== 'openspec'
      ).map(item => ({
        ...item,
        path: item.name,
        id: item.name
      }))
      : []

    return { nextChanges, nextSpecs, nextOther }
  }

  function applyCachedProgressToChanges() {
    for (const node of changesTree.value) {
      const key = normalizePath(node.path || '')
      const cached = taskProgressCache.get(key)
      if (cached) {
        node.progress = cached
      }
    }
  }

  function storeOtherTreeCache(nextOther: TreeNode[]) {
    otherTreeCache = nextOther
    if (otherTreeVisible.value) {
      otherTree.value = nextOther
    }
  }

  function setOtherTreeVisible(visible: boolean) {
    otherTreeVisible.value = visible
    if (visible) {
      otherTree.value = otherTreeCache
    } else {
      otherTree.value = []
    }
  }

  function queueTaskProgressUpdate(node: TreeNode, progress: { completed: number; total: number }) {
    pendingTaskProgressUpdates.push({ node, progress })
    if (taskProgressFlushPending) return
    taskProgressFlushPending = true
    scheduleIdle(() => {
      taskProgressFlushPending = false
      const updates = pendingTaskProgressUpdates.splice(0, pendingTaskProgressUpdates.length)
      for (const update of updates) {
        update.node.progress = update.progress
        taskProgressCache.set(normalizePath(update.node.path || ''), update.progress)
      }
    })
  }

  async function loadTaskProgressForNodes(nodes: TreeNode[], phase: 'initial' | 'background') {
    if (!projectPath.value || !isElectron()) return
    if (nodes.length === 0) return

    const perfEnabled = isPerfEnabled()
    const perfStart = perfEnabled ? perfNow() : 0
    let attempts = 0
    let successes = 0

    const queue = nodes.filter(node => {
      const key = normalizePath(node.path || '')
      if (!key) return false
      if (taskProgressCache.has(key)) return false
      if (taskProgressPending.has(key)) return false
      taskProgressPending.add(key)
      return true
    })

    const workers = Array.from({ length: TASK_PROGRESS_CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const node = queue.shift()
        if (!node || !node.path) continue
        const tasksPath = `${node.path}/tasks.md`
        attempts += 1
        try {
          const fullPath = `${projectPath.value}/${tasksPath}`
          const result = await window.electronAPI!.readFile(fullPath)
          if (result.success && result.content) {
            const progress = parseTaskProgress(result.content)
            queueTaskProgressUpdate(node, progress)
            successes += 1
          }
        } catch {
          // ignore missing tasks.md
        } finally {
          taskProgressPending.delete(normalizePath(node.path))
        }
      }
    })

    await Promise.all(workers)

    if (perfEnabled) {
      const durationMs = perfNow() - perfStart
      perfLog('tasks.load', {
        phase,
        durationMs: Math.round(durationMs * 1000) / 1000,
        changeCount: nodes.length,
        attempts,
        successes
      })
    }
  }

  function queueTaskProgressLoad(token: number) {
    const activeChanges = changesTree.value.filter(n => n.name !== 'archive')
    const pending = activeChanges.filter(node => !taskProgressCache.has(normalizePath(node.path)))
    const initialNodes = pending.slice(0, TASK_PROGRESS_INITIAL_BATCH)
    const remaining = pending.slice(TASK_PROGRESS_INITIAL_BATCH)

    void loadTaskProgressForNodes(initialNodes, 'initial')

    if (remaining.length === 0) return
    let index = 0
    const batchSize = TASK_PROGRESS_INITIAL_BATCH

    const runBatch = async () => {
      if (token !== loadToken) return
      const slice = remaining.slice(index, index + batchSize)
      if (slice.length === 0) return
      await loadTaskProgressForNodes(slice, 'background')
      index += batchSize
      if (index < remaining.length) {
        window.setTimeout(runBatch, 120)
      }
    }

    window.setTimeout(runBatch, 120)
  }

  function scheduleProjectReload(reason: string) {
    if (reloadTimer !== null) {
      window.clearTimeout(reloadTimer)
    }
    reloadTimer = window.setTimeout(() => {
      reloadTimer = null
      void loadProject({ reason })
    }, FILE_CHANGE_DEBOUNCE_MS)
  }

  function scheduleCurrentFileReload(filePath: string) {
    if (currentFileReloadTimer !== null) {
      window.clearTimeout(currentFileReloadTimer)
    }
    currentFileReloadTimer = window.setTimeout(() => {
      currentFileReloadTimer = null
      void loadFile(filePath)
    }, 160)
  }

  function toProjectRelativePath(filePath: string): string | null {
    if (!filePath || !projectPath.value) return null
    const normalizedFile = normalizePath(filePath)
    const normalizedRoot = normalizePath(projectPath.value)
    if (!normalizedFile.startsWith(normalizedRoot)) return null
    let relative = normalizedFile.slice(normalizedRoot.length)
    if (relative.startsWith('/')) relative = relative.slice(1)
    return relative || null
  }

  function isTaskFilePath(filePath: string): boolean {
    const normalized = normalizePath(filePath).toLowerCase()
    return normalized === 'tasks.md' || normalized.endsWith('/tasks.md')
  }

  function invalidateTaskProgressForFile(filePath: string) {
    if (!isTaskFilePath(filePath)) return
    const normalized = normalizePath(filePath)
    const lastSlashIndex = normalized.lastIndexOf('/')
    if (lastSlashIndex === -1) return
    const parentPath = normalized.slice(0, lastSlashIndex)
    const key = normalizePath(parentPath)
    taskProgressCache.delete(key)
    taskProgressPending.delete(key)
  }

  function isCurrentFilePath(filePath: string): boolean {
    const currentPath = normalizePath(currentFile.value?.path || '')
    if (!currentPath) return false
    return currentPath === normalizePath(filePath)
  }

  async function ensureWatchDirectory() {
    if (!projectPath.value || !isElectron()) return
    if (watchedPath === projectPath.value) return
    await window.electronAPI!.watchDirectory({ key: storeKey, dirPath: projectPath.value })
    watchedPath = projectPath.value
  }

  function ensureFileChangeListener() {
    if (fileChangeListenerBound || !isElectron()) return
    removeFileChangeListener = window.electronAPI!.onFileChanged((payload) => {
      const payloadKey = payload?.key || 'default'
      if (payloadKey !== storeKey) return
      scheduleProjectReload('file-change')
      const relativePath = toProjectRelativePath(payload?.path || '')
      if (!relativePath) return
      invalidateTaskProgressForFile(relativePath)
      if (isCurrentFilePath(relativePath)) {
        if (payload?.type === 'unlink' || payload?.type === 'unlinkDir') {
          clearCurrentFile()
          return
        }
        scheduleCurrentFileReload(relativePath)
      }
    })
    fileChangeListenerBound = true
  }

  async function applyTreeInIdle(target: { value: TreeNode[] }, next: TreeNode[], token: number) {
    return new Promise<void>((resolve) => {
      scheduleIdle(() => {
        if (token !== loadToken) {
          resolve()
          return
        }
        target.value = next
        resolve()
      })
    })
  }

  async function loadFullTree(openspecBase: string, token: number, reason: string) {
    if (!projectPath.value || !isElectron()) return
    const perfEnabled = isPerfEnabled()
    const perfStart = perfEnabled ? perfNow() : 0
    let perfError = ''
    isBackgroundLoading.value = true

    try {
      const { nextChanges, nextSpecs, nextOther } = await readProjectTrees(openspecBase, null, true)
      if (token !== loadToken) return
      await applyTreeInIdle(changesTree, nextChanges, token)
      await applyTreeInIdle(specsTree, nextSpecs, token)
      storeOtherTreeCache(nextOther)
      isFullTreeLoaded.value = true
      applyCachedProgressToChanges()
      queueTaskProgressLoad(token)
    } catch (err: any) {
      perfError = err.message || '后台加载失败'
    } finally {
      if (token === loadToken) {
        isBackgroundLoading.value = false
      }
      if (perfEnabled) {
        const durationMs = perfNow() - perfStart
        const payload: Record<string, unknown> = {
          phase: 'full',
          reason,
          depth: null,
          durationMs: Math.round(durationMs * 1000) / 1000,
          changesCount: changesTree.value.length,
          specsCount: specsTree.value.length,
          otherCount: otherTree.value.length
        }
        if (perfError) payload.error = perfError
        perfLog('project.load', payload)
      }
    }
  }

  function scheduleFullTreeLoad(openspecBase: string, token: number, reason: string) {
    if (fullLoadTimer !== null) {
      window.clearTimeout(fullLoadTimer)
    }
    isBackgroundLoading.value = true
    fullLoadTimer = window.setTimeout(() => {
      fullLoadTimer = null
      void loadFullTree(openspecBase, token, reason)
    }, FULL_TREE_LOAD_DELAY_MS)
  }

  function ensureFullTreeLoaded(reason = 'search') {
    if (!projectPath.value || !isElectron()) return
    if (isFullTreeLoaded.value || isBackgroundLoading.value) return
    if (!openspecBasePath.value) return
    scheduleFullTreeLoad(openspecBasePath.value, loadToken, reason)
  }

  // 加载项目
  async function loadProject(options: { reason?: string; depth?: number | null } = {}): Promise<void> {
    if (!projectPath.value || !isElectron()) return

    const perfEnabled = isPerfEnabled()
    const perfStart = perfEnabled ? perfNow() : 0
    let perfError = ''
    const token = ++loadToken
    const maxDepth = options.depth === undefined ? INITIAL_TREE_DEPTH : options.depth
    const phase = maxDepth === null ? 'full' : 'initial'

    try {
      isLoading.value = true
      error.value = ''

      // 检测 OpenSpec 目录位置：可能在根目录或 openspec/ 子目录
      const openspecBase = await resolveOpenSpecBase()
      openspecBasePath.value = openspecBase
      if (maxDepth !== null) {
        isFullTreeLoaded.value = false
      }
      const { nextChanges, nextSpecs, nextOther } = await readProjectTrees(
        openspecBase,
        maxDepth,
        otherTreeVisible.value
      )
      changesTree.value = nextChanges
      specsTree.value = nextSpecs
      storeOtherTreeCache(nextOther)
      applyCachedProgressToChanges()
      queueTaskProgressLoad(token)

      await ensureWatchDirectory()
      ensureFileChangeListener()

      if (maxDepth !== null) {
        scheduleFullTreeLoad(openspecBase, token, options.reason || 'background')
      }

    } catch (err: any) {
      error.value = err.message || '加载项目失败'
      perfError = error.value
    } finally {
      isLoading.value = false
      if (perfEnabled) {
        const durationMs = perfNow() - perfStart
        const payload: Record<string, unknown> = {
          phase,
          reason: options.reason || 'manual',
          depth: maxDepth,
          durationMs: Math.round(durationMs * 1000) / 1000,
          changesCount: changesTree.value.length,
          specsCount: specsTree.value.length,
          otherCount: otherTree.value.length
        }
        if (perfError) payload.error = perfError
        perfLog('project.load', payload)
      }
    }
  }

  // 为树节点添加路径前缀
  function addPathPrefix(items: TreeNode[], prefix: string): TreeNode[] {
    return items.map(item => {
      // main.js 返回的 item.path 是相对于读取目录的路径
      // 需要加上前缀（如 changes/ 或 specs/）
      const fullPath = `${prefix}/${item.path || item.name}`
      
      const processed: TreeNode = { 
        ...item,
        path: fullPath,
        id: fullPath
      }
      
      // 检查是否为归档
      if (fullPath.includes('archive')) {
        processed.isArchived = true
      }
      
      // 递归处理子节点
      if (item.children) {
        processed.children = addPathPrefix(item.children, prefix)
      }
      
      return processed
    })
  }

  async function loadNodeChildren(node: TreeNode): Promise<void> {
    if (!projectPath.value || !isElectron()) return
    if (node.type !== 'folder') return
    if (node.childrenLoaded) return
    const fullPath = `${projectPath.value}/${node.path}`
    try {
      const result = await readDirectoryWithDepth(fullPath, 0)
      if (result.success && result.items) {
        node.children = addPathPrefix(result.items, node.path)
        node.childrenLoaded = true
      }
    } catch {
      // ignore load failures
    }
  }

  // 读取文件内容
  async function loadFile(filePath: string): Promise<void> {
    if (!projectPath.value || !isElectron()) return

    try {
      isLoading.value = true
      error.value = ''
      
      const fullPath = `${projectPath.value}/${filePath}`
      const result = await window.electronAPI!.readFile(fullPath)
      
      if (result.success && result.content !== undefined) {
        const fileName = filePath.split(/[/\\]/).pop() || ''
        const isTask = fileName === 'tasks.md'
        const isImage = result.isImage || false
        
        let fileType: 'markdown' | 'task' | 'code' | 'image' | 'other' = 'other'
        if (isImage) {
          fileType = 'image'
        } else if (isTask) {
          fileType = 'task'
        } else if (fileName.endsWith('.md')) {
          fileType = 'markdown'
        } else if (result.fileType && ['javascript', 'typescript', 'vue', 'json', 'yaml', 'css', 'html', 'python', 'java', 'sql'].includes(result.fileType)) {
          fileType = 'code'
        }
        
        currentFile.value = {
          path: filePath,
          name: fileName,
          content: result.content,
          type: fileType,
          fileType: result.fileType,
          isImage
        }
        
        // 如果是任务文件，解析进度
        if (isTask) {
          const progress = parseTaskProgress(result.content)
          updateNodeProgress(filePath, progress)
        }
      } else {
        error.value = result.error || '读取文件失败'
      }
    } catch (err: any) {
      error.value = err.message || '读取文件失败'
    } finally {
      isLoading.value = false
    }
  }

  // 解析任务进度
  function parseTaskProgress(content: string): { completed: number; total: number } {
    // 使用 parseTaskList 确保统计逻辑与显示逻辑一致
    const tasks = parseTaskList(content).filter(t => !t.isSection)
    const completed = tasks.filter(t => t.checked).length
    return { completed, total: tasks.length }
  }

  // 更新节点进度
  function updateNodeProgress(filePath: string, progress: { completed: number; total: number }): void {
    // filePath 示例: "openspec/changes/add-data-landing-export/tasks.md"
    const normalizedPath = filePath.replace(/\\/g, '/')
    const lastSlashIndex = normalizedPath.lastIndexOf('/')
    if (lastSlashIndex === -1) return
    
    const parentPath = normalizedPath.substring(0, lastSlashIndex)
    
    // 在 changesTree 中查找匹配的节点
    const changeNode = changesTree.value.find(n => {
        const nodePath = n.path?.replace(/\\/g, '/')
        return nodePath === parentPath
    })
    
    if (changeNode) {
      changeNode.progress = progress
    }
    taskProgressCache.set(normalizePath(parentPath), progress)
  }

  // 解析任务列表 - 增强版，支持需求引用和章节标题
  function parseTaskList(content: string): TaskItem[] {
    const lines = content.split('\n')
    const tasks: TaskItem[] = []
    let currentId = 0
    let currentTask: TaskItem | null = null
    let currentSection = ''
    let currentSectionNumberParts: number[] | null = null

    function parseNumberParts(token: string): number[] | null {
      if (!token) return null
      const parts = token.split('.').filter(Boolean)
      if (parts.length === 0) return null
      const numbers: number[] = []
      for (const part of parts) {
        const n = Number(part)
        if (!Number.isInteger(n) || n < 0) return null
        numbers.push(n)
      }
      return numbers
    }

    function extractLeadingNumberParts(text: string): number[] | null {
      const match = text.match(/^(\d+(?:\.\d+)*)(?=\s|$)/)
      if (!match) return null
      return parseNumberParts(match[1])
    }

    function startsWithParts(parts: number[], prefix: number[]): boolean {
      if (prefix.length > parts.length) return false
      for (let i = 0; i < prefix.length; i++) {
        if (parts[i] !== prefix[i]) return false
      }
      return true
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 匹配章节标题 (## 或 ###)
      const sectionMatch = line.match(/^#{2,3}\s+(.+)$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim()
        currentSectionNumberParts = extractLeadingNumberParts(currentSection)
        // 添加章节标题作为特殊项
        tasks.push({
          id: `section-${currentId++}`,
          label: currentSection,
          checked: false,
          level: 0,
          isSection: true
        })
        continue
      }
      
      // 匹配任务行
      const taskMatch = line.match(/^(\s*)-\s*\[(x|\s*)\]\*?\s*(.+)$/i)
      if (taskMatch) {
        const indent = taskMatch[1].length
        const checked = taskMatch[2].toLowerCase() === 'x'
        const label = taskMatch[3].trim()
        const indentLevel = Math.floor(indent / 2)

        // 兼容“无缩进但有编号”的子任务（例如 1.0 章节下的 1.0.1）
        let level = indentLevel
        const leadingNumberParts = extractLeadingNumberParts(label)
        if (leadingNumberParts && currentSectionNumberParts) {
          if (startsWithParts(leadingNumberParts, currentSectionNumberParts)) {
            const diff = leadingNumberParts.length - currentSectionNumberParts.length
            if (diff > level) level = diff
          }
        }
        
        // 解析需求引用 (如 _Requirements: 1.1, 2.3_)
        const reqMatch = label.match(/_Requirements?:\s*([^_]+)_/i)
        const requirements = reqMatch 
          ? reqMatch[1].split(',').map(r => r.trim())
          : []
        
        currentTask = {
          id: `task-${currentId++}`,
          label: label.replace(/_Requirements?:\s*[^_]+_/gi, '').trim(),
          checked,
          level,
          requirements,
          section: currentSection
        }
        
        tasks.push(currentTask)
      }
      // 匹配任务描述（缩进的非任务行）
      else if (currentTask && line.match(/^\s{2,}-\s+[^[\]]/)) {
        const descMatch = line.match(/^\s+-\s+(.+)$/)
        if (descMatch) {
          if (!currentTask.description) {
            currentTask.description = descMatch[1]
          } else {
            currentTask.description += '\n' + descMatch[1]
          }
        }
      }
    }
    
    return tasks
  }

  // 根据需求引用查找规范文件
  function findSpecByRequirement(reqId: string): string | null {
    // 简单实现：在 specs 目录中查找
    // 实际应该解析 spec.md 文件找到对应需求
    return `specs/${reqId.split('.')[0]}/spec.md`
  }

  // 清除当前文件
  function clearCurrentFile(): void {
    currentFile.value = null
  }

  // 重置项目
  function resetProject(): void {
    if (removeFileChangeListener) {
      removeFileChangeListener()
      removeFileChangeListener = null
      fileChangeListenerBound = false
    }
    if (window.electronAPI?.unwatchDirectory) {
      void window.electronAPI.unwatchDirectory(storeKey)
    }
    projectPath.value = ''
    projectName.value = ''
    isOpenSpec.value = false
    changesTree.value = []
    specsTree.value = []
    otherTree.value = []
    currentFile.value = null
    error.value = ''
    isBackgroundLoading.value = false
    isFullTreeLoaded.value = false
    openspecBasePath.value = ''
    otherTreeVisible.value = false
    otherTreeCache = []
    taskProgressCache.clear()
    taskProgressPending.clear()
    pendingTaskProgressUpdates.length = 0
    taskProgressFlushPending = false
    if (fullLoadTimer !== null) {
      window.clearTimeout(fullLoadTimer)
      fullLoadTimer = null
    }
    if (reloadTimer !== null) {
      window.clearTimeout(reloadTimer)
      reloadTimer = null
    }
    watchedPath = ''
  }

  return {
    // 状态
    projectPath,
    projectName,
    isOpenSpec,
    changesTree,
    specsTree,
    otherTree,
    currentFile,
    isLoading,
    isBackgroundLoading,
    error,
    
    // 计算属性
    hasProject,
    allNodes,
    
    // 方法
    isElectron,
    selectProject,
    openProject,
    loadProject,
    ensureFullTreeLoaded,
    loadNodeChildren,
    loadFile,
    setOtherTreeVisible,
    parseTaskList,
    findSpecByRequirement,
    clearCurrentFile,
    resetProject
  }
  })
}

export function useProjectStore(storeKey = 'default') {
  let useStore = projectStoreDefinitions.get(storeKey)
  if (!useStore) {
    useStore = createProjectStore(storeKey)
    projectStoreDefinitions.set(storeKey, useStore)
  }
  return useStore()
}
