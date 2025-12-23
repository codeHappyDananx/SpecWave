<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-content">
      <div v-if="isLoading" class="loading">
        <span>加载中...</span>
      </div>
      <div v-else-if="displayTree.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p v-if="searchQuery">无匹配结果</p>
        <p v-else>暂无内容</p>
      </div>
      <div v-else class="tree-container">
        <!-- 变更区块 -->
        <div v-if="activeChangesTree.length > 0" class="tree-section">
          <div class="section-header" @click="toggleSection('changes')">
            <svg class="section-icon" :class="{ expanded: sectionsExpanded.changes }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="section-title">变更</span>
            <span class="section-count">{{ activeChangesCount }}</span>
          </div>
          <div v-show="sectionsExpanded.changes" class="section-content">
            <TreeNode
              v-for="node in pagedChangesTree"
              :key="node.id"
              :node="node"
              :depth="0"
              :selected-path="selectedPath"
              @select="handleSelect"
              @toggle="handleToggle"
            />
            <button
              v-if="hasMoreChanges"
              class="show-more"
              type="button"
              @click.stop="loadMore('changes')"
            >
              加载更多
            </button>
          </div>
        </div>
        
        <!-- 规范区块 -->
        <div v-if="mergedSpecsTree.length > 0" class="tree-section">
          <div class="section-header" @click="toggleSection('specs')">
            <svg class="section-icon" :class="{ expanded: sectionsExpanded.specs }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="section-title">规范</span>
            <span class="section-count">{{ mergedSpecsTree.length }}</span>
          </div>
          <div v-show="sectionsExpanded.specs" class="section-content">
            <TreeNode
              v-for="node in pagedSpecsTree"
              :key="node.id"
              :node="node"
              :depth="0"
              :selected-path="selectedPath"
              @select="handleSelect"
              @toggle="handleToggle"
            />
            <button
              v-if="hasMoreSpecs"
              class="show-more"
              type="button"
              @click.stop="loadMore('specs')"
            >
              加载更多
            </button>
          </div>
        </div>
        
        <!-- 归档区块 -->
        <div v-if="archiveTree.length > 0" class="tree-section archive-section">
          <div class="section-header" @click="toggleSection('archive')">
            <svg class="section-icon" :class="{ expanded: sectionsExpanded.archive }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="section-title">归档</span>
            <span class="section-count">{{ archiveTree.length }}</span>
          </div>
          <div v-show="sectionsExpanded.archive" class="section-content">
            <TreeNode
              v-for="node in pagedArchiveTree"
              :key="node.id"
              :node="node"
              :depth="0"
              :selected-path="selectedPath"
              @select="handleSelect"
              @toggle="handleToggle"
            />
            <button
              v-if="hasMoreArchive"
              class="show-more"
              type="button"
              @click.stop="loadMore('archive')"
            >
              加载更多
            </button>
          </div>
        </div>
        
        <!-- 其他文件区块（可切换显示） -->
        <div v-if="showAllFiles && otherTree.length > 0" class="tree-section other-files">
          <div class="section-header" @click="toggleSection('other')">
            <svg class="section-icon" :class="{ expanded: sectionsExpanded.other }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="section-title">其他文件</span>
            <span class="section-count">{{ otherTree.length }}</span>
          </div>
          <div v-show="sectionsExpanded.other" class="section-content">
            <TreeNode
              v-for="node in pagedOtherTree"
              :key="node.id"
              :node="node"
              :depth="0"
              :selected-path="selectedPath"
              @select="handleSelect"
              @toggle="handleToggle"
            />
            <button
              v-if="hasMoreOther"
              class="show-more"
              type="button"
              @click.stop="loadMore('other')"
            >
              加载更多
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 底部开关 -->
    <div class="sidebar-footer">
      <label class="toggle-switch">
        <input type="checkbox" v-model="showAllFiles" />
        <span class="toggle-slider"></span>
        <span class="toggle-label">显示全部文件</span>
      </label>
    </div>
    
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import type { TreeNode as TreeNodeType } from '../types'
import TreeNode from './TreeNode.vue'
import { isPerfEnabled, perfLog, perfNow } from '../utils/perf'
import { useProjectStore } from '../stores/project'

const props = defineProps<{
  width: number
  searchQuery: string
  changesTree: TreeNodeType[]
  specsTree: TreeNodeType[]
  otherTree: TreeNodeType[]
  isLoading: boolean
}>()

const emit = defineEmits<{
  'select-file': [path: string]
}>()

const projectStore = useProjectStore()
const selectedPath = ref('')
const showAllFiles = ref(false)
const sectionsExpanded = reactive({
  changes: true,
  specs: true,
  archive: false,
  other: false
})
const debouncedQuery = ref('')
const SEARCH_DEBOUNCE_MS = 160
const SECTION_PAGE_SIZE = 200
let searchTimer: number | null = null
const sectionLimits = reactive({
  changes: SECTION_PAGE_SIZE,
  specs: SECTION_PAGE_SIZE,
  archive: SECTION_PAGE_SIZE,
  other: SECTION_PAGE_SIZE
})

// 从 changesTree 中分离出 archive
const activeChangesTree = computed(() => {
  return props.changesTree.filter(n => n.name !== 'archive')
})

const archiveTree = computed(() => {
  const archive = props.changesTree.find(n => n.name === 'archive')
  return archive?.children || []
})

// 计算活动变更数量
const activeChangesCount = computed(() => {
  return activeChangesTree.value.length
})

const hasOpenSpecSubdir = computed(() => {
  return props.specsTree.some((node) => node.path.startsWith('openspec/')) ||
    props.changesTree.some((node) => node.path.startsWith('openspec/'))
})

const baseSpecsTree = computed(() => {
  const children: TreeNodeType[] = []
  const hasRootAgents = props.otherTree.some((node) => node.name === 'AGENTS.md')
  if (hasRootAgents) {
    children.push({
      id: 'base-specs:agents-root',
      name: 'AGENTS.md',
      displayName: '根目录 AGENTS',
      type: 'file',
      path: 'AGENTS.md'
    })
  }
  if (hasOpenSpecSubdir.value) {
    children.push({
      id: 'base-specs:agents-openspec',
      name: 'AGENTS.md',
      displayName: 'OpenSpec AGENTS',
      type: 'file',
      path: 'openspec/AGENTS.md'
    })
    children.push({
      id: 'base-specs:project',
      name: 'project.md',
      displayName: 'OpenSpec 项目说明',
      type: 'file',
      path: 'openspec/project.md'
    })
  }
  if (children.length === 0) return []
  return [{
    id: 'base-specs',
    name: '基础规范',
    type: 'folder',
    path: 'base-specs',
    isExpanded: true,
    children
  }]
})

const mergedSpecsTree = computed(() => {
  return [...baseSpecsTree.value, ...props.specsTree]
})

// 合并显示的树
const displayTree = computed(() => {
  const result: TreeNodeType[] = []
  if (activeChangesTree.value.length > 0) result.push(...activeChangesTree.value)
  if (mergedSpecsTree.value.length > 0) result.push(...mergedSpecsTree.value)
  if (archiveTree.value.length > 0) result.push(...archiveTree.value)
  if (showAllFiles.value && props.otherTree.length > 0) result.push(...props.otherTree)
  return result
})

watch(() => props.searchQuery, (value) => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
  if (!value) {
    debouncedQuery.value = ''
    if (!showAllFiles.value) {
      projectStore.setOtherTreeVisible(false)
    }
    return
  }
  projectStore.ensureFullTreeLoaded('search')
  projectStore.setOtherTreeVisible(true)
  searchTimer = window.setTimeout(() => {
    debouncedQuery.value = value.toLowerCase()
  }, SEARCH_DEBOUNCE_MS)
}, { immediate: true })

watch(debouncedQuery, () => {
  sectionLimits.changes = SECTION_PAGE_SIZE
  sectionLimits.specs = SECTION_PAGE_SIZE
  sectionLimits.archive = SECTION_PAGE_SIZE
  sectionLimits.other = SECTION_PAGE_SIZE
})

watch(showAllFiles, (value) => {
  if (value) {
    projectStore.setOtherTreeVisible(true)
    projectStore.ensureFullTreeLoaded('show-all')
  } else if (!debouncedQuery.value) {
    projectStore.setOtherTreeVisible(false)
  }
}, { immediate: true })

const filterCache = new WeakMap<TreeNodeType[], Map<string, TreeNodeType[]>>()

function getCachedFilter(nodes: TreeNodeType[], query: string) {
  let cache = filterCache.get(nodes)
  if (!cache) {
    cache = new Map()
    filterCache.set(nodes, cache)
  }
  const cached = cache.get(query)
  if (cached) return { result: cached, cacheHit: true }
  const result = filterTree(nodes, query)
  cache.set(query, result)
  return { result, cacheHit: false }
}

// 过滤树（搜索）
function filterTree(nodes: TreeNodeType[], query: string): TreeNodeType[] {
  if (!query) return nodes
  
  const result: TreeNodeType[] = []
  for (const node of nodes) {
    const label = (node.displayName || node.name).toLowerCase()
    const nameMatch = label.includes(query)
    let filteredChildren: TreeNodeType[] | undefined
    
    if (node.children) {
      filteredChildren = filterTree(node.children, query)
    }
    
    if (nameMatch || (filteredChildren && filteredChildren.length > 0)) {
      result.push({
        ...node,
        children: filteredChildren,
        isExpanded: true
      })
    }
  }
  return result
}

function filterTreeWithMetrics(nodes: TreeNodeType[], query: string, label: string): TreeNodeType[] {
  if (!query) return nodes
  const perfEnabled = isPerfEnabled()
  const start = perfEnabled ? perfNow() : 0
  const { result, cacheHit } = getCachedFilter(nodes, query)
  if (perfEnabled) {
    const durationMs = perfNow() - start
    perfLog('sidebar.filter', {
      label,
      queryLen: query.length,
      rootCount: nodes.length,
      durationMs: Math.round(durationMs * 1000) / 1000,
      cacheHit
    })
  }
  return result
}

const filteredChangesTree = computed(() => {
  return filterTreeWithMetrics(activeChangesTree.value, debouncedQuery.value, 'changes')
})

const filteredSpecsTree = computed(() => {
  return filterTreeWithMetrics(mergedSpecsTree.value, debouncedQuery.value, 'specs')
})

const filteredArchiveTree = computed(() => {
  return filterTreeWithMetrics(archiveTree.value, debouncedQuery.value, 'archive')
})

const filteredOtherTree = computed(() => {
  return filterTreeWithMetrics(props.otherTree, debouncedQuery.value, 'other')
})

const pagedChangesTree = computed(() => {
  return filteredChangesTree.value.slice(0, sectionLimits.changes)
})

const pagedSpecsTree = computed(() => {
  return filteredSpecsTree.value.slice(0, sectionLimits.specs)
})

const pagedArchiveTree = computed(() => {
  return filteredArchiveTree.value.slice(0, sectionLimits.archive)
})

const pagedOtherTree = computed(() => {
  return filteredOtherTree.value.slice(0, sectionLimits.other)
})

const hasMoreChanges = computed(() => {
  return filteredChangesTree.value.length > sectionLimits.changes
})

const hasMoreSpecs = computed(() => {
  return filteredSpecsTree.value.length > sectionLimits.specs
})

const hasMoreArchive = computed(() => {
  return filteredArchiveTree.value.length > sectionLimits.archive
})

const hasMoreOther = computed(() => {
  return filteredOtherTree.value.length > sectionLimits.other
})

function loadMore(section: 'changes' | 'specs' | 'archive' | 'other') {
  sectionLimits[section] += SECTION_PAGE_SIZE
}

function toggleSection(section: 'changes' | 'specs' | 'archive' | 'other') {
  sectionsExpanded[section] = !sectionsExpanded[section]
}

function handleSelect(node: TreeNodeType) {
  if (node.type === 'file') {
    selectedPath.value = node.path
    emit('select-file', node.path)
  }
}

async function handleToggle(node: TreeNodeType) {
  if (node.type === 'folder' && node.childrenLoaded === false) {
    await projectStore.loadNodeChildren(node)
  }
  node.isExpanded = !node.isExpanded
}

</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--bg-secondary);
  position: relative;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.tree-container {
  padding: 0 8px;
}

.show-more {
  margin: 6px 0 8px 20px;
  padding: 2px 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.show-more:hover {
  color: var(--text-primary);
}

.loading,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-secondary);
}

.empty-state svg {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

/* 区块样式 */
.tree-section {
  margin-bottom: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.section-icon.expanded {
  transform: rotate(90deg);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-count {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 10px;
}

.section-content {
  padding-left: 4px;
}

.other-files {
  opacity: 0.7;
}

.archive-section {
  opacity: 0.7;
}

.archive-section .section-title {
  color: var(--text-secondary);
}

/* 底部开关 */
.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}

.toggle-switch input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 32px;
  height: 18px;
  background: var(--bg-tertiary);
  border-radius: 9px;
  flex-shrink: 0;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--accent-color);
}

.toggle-switch input:checked + .toggle-slider::after {
  left: 16px;
}

.toggle-label {
  flex: 1;
}

</style>
