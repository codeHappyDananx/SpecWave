import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TreeNode, FileContent, TaskItem } from '../types'
import { isPerfEnabled, perfLog, perfNow } from '../utils/perf'

export const useProjectStore = defineStore('project', () => {
  // 状态
  const projectPath = ref<string>('')
  const projectName = ref<string>('')
  const isOpenSpec = ref(false)
  const changesTree = ref<TreeNode[]>([])
  const specsTree = ref<TreeNode[]>([])
  const otherTree = ref<TreeNode[]>([])
  const currentFile = ref<FileContent | null>(null)
  const isLoading = ref(false)
  const error = ref<string>('')

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

  // 加载项目
  async function loadProject(): Promise<void> {
    if (!projectPath.value || !isElectron()) return

    const perfEnabled = isPerfEnabled()
    const perfStart = perfEnabled ? perfNow() : 0
    let perfError = ''

    try {
      isLoading.value = true
      error.value = ''

      // 检测 OpenSpec 目录位置：可能在根目录或 openspec/ 子目录
      let openspecBase = projectPath.value
      
      // 先检查是否有 openspec/ 子目录
      const openspecSubdir = `${projectPath.value}/openspec`
      const openspecCheck = await window.electronAPI!.readDirectory(openspecSubdir)
      if (openspecCheck.success && openspecCheck.items) {
        // 检查 openspec/ 下是否有 changes 或 specs
        const hasChanges = openspecCheck.items.some(item => item.name === 'changes')
        const hasSpecs = openspecCheck.items.some(item => item.name === 'specs')
        if (hasChanges || hasSpecs) {
          openspecBase = openspecSubdir
        }
      }

      // 读取 changes 目录
      const changesPath = `${openspecBase}/changes`
      const changesResult = await window.electronAPI!.readDirectory(changesPath)
      if (changesResult.success && changesResult.items) {
        // 根据 openspecBase 设置正确的路径前缀
        const pathPrefix = openspecBase === projectPath.value ? 'changes' : 'openspec/changes'
        changesTree.value = addPathPrefix(changesResult.items, pathPrefix)
      } else {
        changesTree.value = []
      }

      // 读取 specs 目录
      const specsPath = `${openspecBase}/specs`
      const specsResult = await window.electronAPI!.readDirectory(specsPath)
      if (specsResult.success && specsResult.items) {
        const pathPrefix = openspecBase === projectPath.value ? 'specs' : 'openspec/specs'
        specsTree.value = addPathPrefix(specsResult.items, pathPrefix)
      } else {
        specsTree.value = []
      }

      // 异步加载所有任务进度
      loadAllTaskProgress()

      // 读取其他文件（根目录）
      const rootResult = await window.electronAPI!.readDirectory(projectPath.value)
      if (rootResult.success && rootResult.items) {
        // 过滤掉 changes、specs 和 openspec
        otherTree.value = rootResult.items.filter(item => 
          item.name !== 'changes' && item.name !== 'specs' && item.name !== 'openspec'
        ).map(item => ({
          ...item,
          path: item.name,
          id: item.name
        }))
      } else {
        otherTree.value = []
      }

      // 启动文件监听
      await window.electronAPI!.watchDirectory(projectPath.value)
      
      // 监听文件变化
      window.electronAPI!.onFileChanged((data) => {
        console.log('File changed:', data)
        // 重新加载项目
        loadProject()
      })

    } catch (err: any) {
      error.value = err.message || '加载项目失败'
      perfError = error.value
    } finally {
      isLoading.value = false
      if (perfEnabled) {
        const durationMs = perfNow() - perfStart
        const payload: Record<string, unknown> = {
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
  }

  // 加载所有 Change 的任务进度
  async function loadAllTaskProgress() {
    if (!projectPath.value || !isElectron()) return

    const perfEnabled = isPerfEnabled()
    const perfStart = perfEnabled ? perfNow() : 0
    let attempts = 0
    let successes = 0

    for (const node of changesTree.value) {
      // 假设每个 Change 文件夹下都有一个 tasks.md
      const tasksPath = `${node.path}/tasks.md`
      try {
        attempts += 1
        const fullPath = `${projectPath.value}/${tasksPath}`
        const result = await window.electronAPI!.readFile(fullPath)
        
        if (result.success && result.content) {
          const progress = parseTaskProgress(result.content)
          node.progress = progress
          successes += 1
        }
      } catch (e) {
        // 忽略读取失败（可能没有 tasks.md）
        console.warn(`Failed to load progress for ${tasksPath}`, e)
      }
    }

    if (perfEnabled) {
      const durationMs = perfNow() - perfStart
      perfLog('tasks.load', {
        durationMs: Math.round(durationMs * 1000) / 1000,
        changeCount: changesTree.value.length,
        attempts,
        successes
      })
    }
  }

  // 解析任务列表 - 增强版，支持需求引用和章节标题
  function parseTaskList(content: string): TaskItem[] {
    const lines = content.split('\n')
    const tasks: TaskItem[] = []
    let currentId = 0
    let currentTask: TaskItem | null = null
    let currentSection = ''
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // 匹配章节标题 (## 或 ###)
      const sectionMatch = line.match(/^#{2,3}\s+(.+)$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim()
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
        const level = Math.floor(indent / 2)
        
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
    projectPath.value = ''
    projectName.value = ''
    isOpenSpec.value = false
    changesTree.value = []
    specsTree.value = []
    otherTree.value = []
    currentFile.value = null
    error.value = ''
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
    error,
    
    // 计算属性
    hasProject,
    allNodes,
    
    // 方法
    isElectron,
    selectProject,
    loadProject,
    loadFile,
    parseTaskList,
    findSpecByRequirement,
    clearCurrentFile,
    resetProject
  }
})
