<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-content">
      <div class="sidebar-header">
        <span class="header-title">资源管理器</span>
        <div class="header-actions">
          <button class="action-btn" title="全部折叠" @click="collapseAll">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 14h6v6"/>
              <path d="M20 10h-6V4"/>
              <path d="M14 4h6v6"/>
              <path d="M10 20H4v-6"/>
            </svg>
          </button>
        </div>
      </div>
      <div v-if="displayTree.length === 0 && !isLoading" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p v-if="searchQuery">无匹配结果</p>
        <p v-else>暂无内容</p>
      </div>
      <div v-else class="tree-container">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <NConfigProvider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
          <NDropdown
            trigger="manual"
            :show="contextMenu.show"
            :x="contextMenu.x"
            :y="contextMenu.y"
            :options="contextMenuOptions"
            @select="handleContextMenuSelect"
            @clickoutside="closeContextMenu"
          />

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
              <NTree
                class="sidebar-tree"
                :data="changesTreeData"
                key-field="id"
                label-field="name"
                children-field="children"
                :selected-keys="selectedKeys"
                :expanded-keys="changesExpandedKeys"
                :indent="24"
                :block-line="true"
                :block-node="true"
                :expand-on-click="true"
                :render-prefix="renderPrefix"
                :render-label="renderLabel"
                :render-suffix="renderSuffix"
                :node-props="treeNodeProps"
                :on-load="handleLazyLoad"
                @update:selected-keys="handleUpdateSelectedKeys"
                @update:expanded-keys="(keys, _options, meta) => handleUpdateExpandedKeys('changes', keys, meta)"
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
              <NTree
                class="sidebar-tree"
                :data="specsTreeData"
                key-field="id"
                label-field="name"
                children-field="children"
                :selected-keys="selectedKeys"
                :expanded-keys="specsExpandedKeys"
                :indent="20"
                :block-line="true"
                :block-node="true"
                :expand-on-click="true"
                :render-prefix="renderPrefix"
                :render-label="renderLabel"
                :render-suffix="renderSuffix"
                :node-props="treeNodeProps"
                :on-load="handleLazyLoad"
                @update:selected-keys="handleUpdateSelectedKeys"
                @update:expanded-keys="(keys, _options, meta) => handleUpdateExpandedKeys('specs', keys, meta)"
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
              <NTree
                class="sidebar-tree"
                :data="archiveTreeData"
                key-field="id"
                label-field="name"
                children-field="children"
                :selected-keys="selectedKeys"
                :expanded-keys="archiveExpandedKeys"
                :indent="24"
                :block-line="true"
                :block-node="true"
                :expand-on-click="true"
                :render-prefix="renderPrefix"
                :render-label="renderLabel"
                :render-suffix="renderSuffix"
                :node-props="treeNodeProps"
                :on-load="handleLazyLoad"
                @update:selected-keys="handleUpdateSelectedKeys"
                @update:expanded-keys="(keys, _options, meta) => handleUpdateExpandedKeys('archive', keys, meta)"
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
          <div v-if="showAllFiles && props.otherTree.length > 0" class="tree-section other-files">
            <div class="section-header" @click="toggleSection('other')">
              <svg class="section-icon" :class="{ expanded: sectionsExpanded.other }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span class="section-title">其他文件</span>
              <span class="section-count">{{ props.otherTree.length }}</span>
            </div>
            <div v-show="sectionsExpanded.other" class="section-content">
              <NTree
                class="sidebar-tree"
                :data="otherTreeData"
                key-field="id"
                label-field="name"
                children-field="children"
                :selected-keys="selectedKeys"
                :expanded-keys="otherExpandedKeys"
                :indent="24"
                :block-line="true"
                :block-node="true"
                :expand-on-click="true"
                :render-prefix="renderPrefix"
                :render-label="renderOtherLabel"
                :render-suffix="renderSuffix"
                :node-props="treeNodeProps"
                :on-load="handleOtherLoad"
                @update:selected-keys="handleUpdateSelectedKeys"
                @update:expanded-keys="(keys, _options, meta) => handleUpdateExpandedKeys('other', keys, meta)"
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
        </NConfigProvider>
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
import { ref, computed, reactive, watch, h } from 'vue'
import { NConfigProvider, NDropdown, NTree, darkTheme, type DropdownOption, type GlobalThemeOverrides, type TreeOption } from 'naive-ui'
import type { TreeNode as TreeNodeType } from '../types'
import { isPerfEnabled, perfLog, perfNow } from '../utils/perf'
import { useProjectStore } from '../stores/project'
import { useUIStore } from '../stores/ui'

const props = defineProps<{
  storeKey: string
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

let projectStore = useProjectStore(props.storeKey)
watch(() => props.storeKey, (next) => {
  projectStore = useProjectStore(next)
})
const uiStore = useUIStore()
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

const naiveTheme = computed(() => (uiStore.theme === 'dark' ? darkTheme : null))
const naiveThemeOverrides = computed<GlobalThemeOverrides>(() => {
  const isDark = uiStore.theme === 'dark'
  return {
    common: {
      primaryColor: isDark ? '#4fc3f7' : '#2196f3',
      primaryColorHover: isDark ? '#29b6f6' : '#1976d2',
      borderColor: isDark ? '#3c3c3c' : '#dee2e6',
      cardColor: isDark ? '#252526' : '#ffffff',
      bodyColor: isDark ? '#252526' : '#f8f9fa',
      textColor1: isDark ? '#e0e0e0' : '#1a1a1a',
      textColor2: isDark ? '#9e9e9e' : '#6c757d'
    }
  }
})

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  node: null as TreeNodeType | null
})

const contextMenuOptions = computed<DropdownOption[]>(() => ([
  { key: 'copy-name', label: '复制文件名' },
  { key: 'copy-path', label: '复制相对路径' },
  { key: 'reveal', label: '在系统资源管理器打开' }
]))

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

const baseSpecsTree = computed<TreeNodeType[]>(() => {
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

const mergedSpecsTree = computed<TreeNodeType[]>(() => {
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

const expandedKeys = reactive<Record<'changes' | 'specs' | 'archive' | 'other', string[]>>({
  changes: [],
  specs: [],
  archive: [],
  other: []
})

const selectedKeys = computed(() => (selectedPath.value ? [selectedPath.value] : []))

function normalizeRelativePath(value: string): string {
  return String(value || '').replace(/\\/g, '/')
}

function ensureTreeNodeFlags(nodes: TreeNodeType[]) {
  for (const node of nodes) {
    ;(node as unknown as TreeOption).isLeaf = node.type === 'file'
    if (node.children) ensureTreeNodeFlags(node.children)
  }
}

function collectExpandedKeys(nodes: TreeNodeType[]): string[] {
  const keys: string[] = []
  const walk = (list: TreeNodeType[]) => {
    for (const node of list) {
      if (node.type === 'folder' && node.isExpanded) keys.push(node.id)
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return keys
}

const changesTreeData = computed<TreeOption[]>(() => {
  const nodes = pagedChangesTree.value
  ensureTreeNodeFlags(nodes)
  return nodes as unknown as TreeOption[]
})

const specsTreeData = computed<TreeOption[]>(() => {
  const nodes = pagedSpecsTree.value
  ensureTreeNodeFlags(nodes)
  return nodes as unknown as TreeOption[]
})

const archiveTreeData = computed<TreeOption[]>(() => {
  const nodes = pagedArchiveTree.value
  ensureTreeNodeFlags(nodes)
  return nodes as unknown as TreeOption[]
})

const otherTreeData = computed<TreeOption[]>(() => {
  const nodes = pagedOtherTree.value
  ensureTreeNodeFlags(nodes)
  return nodes as unknown as TreeOption[]
})

const changesExpandedKeys = computed(() => (debouncedQuery.value ? collectExpandedKeys(pagedChangesTree.value) : expandedKeys.changes))
const specsExpandedKeys = computed(() => (debouncedQuery.value ? collectExpandedKeys(pagedSpecsTree.value) : expandedKeys.specs))
const archiveExpandedKeys = computed(() => (debouncedQuery.value ? collectExpandedKeys(pagedArchiveTree.value) : expandedKeys.archive))
const otherExpandedKeys = computed(() => (debouncedQuery.value ? collectExpandedKeys(pagedOtherTree.value) : expandedKeys.other))

const nameMap: Record<string, string> = {
  // 文件
  'tasks.md': '任务清单',
  'proposal.md': '提案',
  'design.md': '设计文档',
  'spec.md': '规范',
  'project.md': '项目说明',
  'README.md': '说明文档',
  'CHANGELOG.md': '更新日志',
  // 文件夹
  'archive': '归档',
  'references': '参考资料',
  'specs': '规范增量',
  'changes': '变更',
  'docs': '文档',
  'src': '源代码',
  'test': '测试',
  'tests': '测试'
}

function getDisplayName(node: TreeNodeType): string {
  return node.displayName || nameMap[node.name] || node.name
}

function isTaskFile(node: TreeNodeType): boolean {
  return node.type === 'file' && node.name === 'tasks.md'
}

function isMarkdownFile(node: TreeNodeType): boolean {
  return node.type === 'file' && node.name.endsWith('.md') && !isTaskFile(node)
}

function isImageFile(node: TreeNodeType): boolean {
  if (node.type !== 'file') return false
  const ext = node.name.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'].includes(ext || '')
}

function isConfigFile(node: TreeNodeType): boolean {
  if (node.type !== 'file') return false
  const ext = node.name.split('.').pop()?.toLowerCase()
  return ['json', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext || '')
}

function isCodeFile(node: TreeNodeType): boolean {
  if (node.type !== 'file') return false
  const ext = node.name.split('.').pop()?.toLowerCase()
  return ['js', 'ts', 'vue', 'jsx', 'tsx', 'py', 'java', 'css', 'scss', 'html', 'xml', 'sql', 'sh', 'bat', 'ps1'].includes(ext || '')
}

function getIconClass(node: TreeNodeType): string {
  if (node.type === 'folder') return 'folder'
  if (isTaskFile(node)) return 'task'
  if (isMarkdownFile(node)) return 'markdown'
  if (isCodeFile(node)) return 'code'
  if (isImageFile(node)) return 'image'
  if (isConfigFile(node)) return 'config'
  return 'file'
}

function collapseAll() {
  sectionsExpanded.changes = true // 保持默认展开状态，或者全部折叠？用户通常希望折叠的是树节点
  sectionsExpanded.specs = true
  sectionsExpanded.archive = false
  sectionsExpanded.other = false
  
  expandedKeys.changes = []
  expandedKeys.specs = []
  expandedKeys.archive = []
  expandedKeys.other = []
}

function renderPrefix({ option }: { option: TreeOption }) {
  const node = option as unknown as TreeNodeType
  const iconClass = getIconClass(node)
  
  // VS Code 风格的图标
  const folderSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.25 4L6.75 3H2V13H14V4H7.25Z" fill="#C49A50" stroke="#9A7736" stroke-linejoin="round"/></svg>'
  
  const folderOpenSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.25 4L6.75 3H2V13H14V4H7.25Z" fill="#C49A50" stroke="#9A7736" stroke-linejoin="round"/><path d="M14 5H2L1 13H15L14 5Z" fill="#EAD49B" stroke="#C49A50" stroke-linejoin="round"/></svg>'
  
  const taskSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#E8F5E9" stroke="#4CAF50"/><path d="M5 7L7 9L11 5" stroke="#2E7D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  
  const mdSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#E1F5FE" stroke="#039BE5"/><path d="M5 5V9L7 7L9 9V5" stroke="#0277BD" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 11H5" stroke="#0277BD" stroke-width="1.5" stroke-linecap="round"/></svg>'
  
  const codeSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#F3E5F5" stroke="#9C27B0"/><path d="M10 6L12 8L10 10" stroke="#7B1FA2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6L4 8L6 10" stroke="#7B1FA2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  
  const imageSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#FFF3E0" stroke="#FF9800"/><circle cx="6" cy="6" r="1.5" fill="#EF6C00"/><path d="M13 11L10 8L6 12L5 11L3 13H13V11Z" fill="#FFB74D"/></svg>'
  
  const configSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#ECEFF1" stroke="#607D8B"/><path d="M8 5V11" stroke="#455A64" stroke-width="1.5" stroke-linecap="round"/><path d="M5 8H11" stroke="#455A64" stroke-width="1.5" stroke-linecap="round"/></svg>'
  
  const fileSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2H13V14H3V2Z" fill="#FAFAFA" stroke="#9E9E9E"/></svg>'
  
  const svg = node.type === 'folder'
    ? (node.isExpanded ? folderOpenSvg : folderSvg)
    : isTaskFile(node)
      ? taskSvg
      : isMarkdownFile(node)
        ? mdSvg
        : isCodeFile(node)
          ? codeSvg
          : isImageFile(node)
            ? imageSvg
            : isConfigFile(node)
              ? configSvg
              : fileSvg

  return h('span', { class: ['node-icon', iconClass], innerHTML: svg })
}

function renderLabel({ option }: { option: TreeOption }) {
  const node = option as unknown as TreeNodeType
  return h('span', { class: ['node-name', node.isArchived ? 'archived' : ''] }, getDisplayName(node))
}

function renderOtherLabel({ option }: { option: TreeOption }) {
  const node = option as unknown as TreeNodeType
  return h('span', { class: ['node-name', node.isArchived ? 'archived' : ''] }, node.name)
}

function renderSuffix({ option }: { option: TreeOption }) {
  const node = option as unknown as TreeNodeType
  if (!node.progress) return null
  const { completed, total } = node.progress
  const progressClass = completed === total ? 'complete' : completed > 0 ? 'partial' : 'none'
  return h('span', { class: ['progress-badge', progressClass] }, `${completed}/${total}`)
}

function openContextMenu(event: MouseEvent, node: TreeNodeType) {
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.node = node
  contextMenu.show = true
}

function closeContextMenu() {
  contextMenu.show = false
  contextMenu.node = null
}

function treeNodeProps({ option }: { option: TreeOption }) {
  const node = option as unknown as TreeNodeType
  return {
    class: node.isArchived ? 'tree-node-archived' : undefined,
    onContextmenu: (event: MouseEvent) => {
      event.preventDefault()
      openContextMenu(event, node)
    }
  }
}

async function handleContextMenuSelect(key: string | number) {
  const node = contextMenu.node
  closeContextMenu()
  if (!node || !window.electronAPI) return

  const relativePath = normalizeRelativePath(node.path)

  if (key === 'copy-name') {
    window.electronAPI.clipboardWriteText(node.name)
    return
  }

  if (key === 'copy-path') {
    window.electronAPI.clipboardWriteText(relativePath)
    return
  }

  if (key === 'reveal') {
    const projectRoot = projectStore.projectPath
    if (!projectRoot || !window.electronAPI.revealInExplorer) return
    const fullPath = `${normalizeRelativePath(projectRoot)}/${relativePath}`
    await window.electronAPI.revealInExplorer({ path: fullPath, isDirectory: node.type === 'folder' })
  }
}

function handleUpdateSelectedKeys(keys: Array<string | number>, _options: Array<TreeOption | null>, meta: { node: TreeOption | null } | null) {
  const next = keys.length > 0 ? String(keys[0]) : ''
  selectedPath.value = next
  const node = meta?.node as unknown as TreeNodeType | null
  if (node?.type === 'file') {
    emit('select-file', node.path)
  }
}

function handleUpdateExpandedKeys(section: 'changes' | 'specs' | 'archive' | 'other', keys: Array<string | number>, meta: { node: TreeOption | null; action: 'expand' | 'collapse' | 'filter' } | null) {
  expandedKeys[section] = keys.map(String)
  const node = meta?.node as unknown as TreeNodeType | null
  if (node && typeof node.isExpanded === 'boolean' && (meta?.action === 'expand' || meta?.action === 'collapse')) {
    node.isExpanded = meta.action === 'expand'
  }
}

async function handleOtherLoad(option: TreeOption) {
  if (debouncedQuery.value) return
  const node = option as unknown as TreeNodeType
  if (node.type !== 'folder') return
  if (node.childrenLoaded !== false) return
  await projectStore.loadNodeChildren(node)
}

async function handleLazyLoad(option: TreeOption) {
  if (debouncedQuery.value) return
  const node = option as unknown as TreeNodeType
  if (node.type !== 'folder') return
  if (node.childrenLoaded !== false) return
  await projectStore.loadNodeChildren(node)
}

</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--bg-secondary);
  position: relative;
  border-right: 1px solid var(--border-color);
  min-width: 0;
}

.light-theme .sidebar {
  background: #f5f5f5;
}

.dark-theme .sidebar {
  background: var(--bg-secondary);
}

.sidebar-content {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  height: 35px;
  min-height: 35px;
  flex-shrink: 0;
  border-bottom: 1px solid transparent;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.sidebar-header:hover .header-actions {
  opacity: 1;
}

.action-btn {
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tree-container {
  padding: 0;
  position: relative;
}

.sidebar-tree :deep(.n-tree) {
  width: max-content;
  min-width: 100%;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: linear-gradient(to bottom, rgba(245, 245, 245, 0.96), rgba(245, 245, 245, 0.6));
  color: var(--text-secondary);
  font-size: 12px;
  z-index: 5;
  pointer-events: none;
}

.dark-theme .loading-overlay {
  background: linear-gradient(to bottom, rgba(37, 37, 38, 0.96), rgba(37, 37, 38, 0.6));
}

.loading-spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid rgba(0, 0, 0, 0.12);
  border-top-color: var(--text-secondary);
  animation: sidebar-spin 0.9s linear infinite;
}

.dark-theme .loading-spinner {
  border-color: rgba(255, 255, 255, 0.16);
  border-top-color: var(--text-secondary);
}

@keyframes sidebar-spin {
  to { transform: rotate(360deg); }
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
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  cursor: pointer;
  border-radius: 0;
  user-select: none;
  background: transparent;
  margin-bottom: 0;
  margin-top: 4px;
  transition: background-color 0.2s;
}

.dark-theme .section-header {
  background: transparent;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: transform 0.2s;
  width: 14px;
  height: 14px;
}

.section-icon.expanded {
  transform: rotate(90deg);
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.section-count {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 6px;
  background: var(--bg-tertiary);
  border-radius: 10px;
  color: var(--text-secondary);
  min-width: 16px;
  text-align: center;
}

.dark-theme .section-count {
  background: rgba(255,255,255,0.1);
}

.section-content {
  padding: 0 8px;
}

.sidebar-tree {
  /* padding: 0 10px; removed to avoid double padding or overflow */
}

/* 强制给树节点内容添加右内边距，确保 Badge 不贴边 */
.sidebar-tree :deep(.n-tree-node-content) {
  padding: 1px 0;
  padding-right: 8px !important;
  border-radius: 0;
  min-height: 22px;
  background: transparent;
  position: relative;
  transition: background-color 0.1s;
}

/* 选中状态左侧高亮条 */
.sidebar-tree :deep(.n-tree-node--selected)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-color);
  z-index: 1;
}

.dark-theme .sidebar-tree :deep(.n-tree-node--selected)::before {
  background: var(--accent-color);
}

.sidebar-tree :deep(.n-tree-node:hover) {
  background: var(--bg-hover);
}

.sidebar-tree :deep(.n-tree-node--selected) {
  background: var(--bg-selected);
}

.light-theme .sidebar-tree :deep(.n-tree-node:hover) {
  background: rgba(0,0,0,0.04);
}

.light-theme .sidebar-tree :deep(.n-tree-node--selected) {
  background: rgba(33, 150, 243, 0.1);
}

.dark-theme .sidebar-tree :deep(.n-tree-node:hover) {
  background: rgba(255,255,255,0.06);
}

.dark-theme .sidebar-tree :deep(.n-tree-node--selected) {
  background: rgba(79, 195, 247, 0.12);
}

.sidebar-tree :deep(.tree-node-archived) {
  opacity: 0.7;
}

.node-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  margin-right: 4px;
}

/* SVGs are now colored inline */
.node-name {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  line-height: 1.5;
}

.node-name.archived {
  font-style: italic;
  color: var(--text-secondary);
}

/* Using :deep to ensure styles apply to NTree rendered content */
.sidebar-tree :deep(.progress-badge) {
  font-size: 10px;
  font-family: Consolas, "Courier New", monospace;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  margin-left: auto;
  /* margin-right is handled by parent container padding */
  flex-shrink: 0;
  min-width: 16px;
  text-align: center;
}

.other-files {
  opacity: 1;
}

.archive-section {
  opacity: 1;
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
