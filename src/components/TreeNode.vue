<template>
  <div class="tree-node" :class="{ archived: node.isArchived }">
    <div 
      class="node-row"
      :class="{ selected: isSelected, folder: isFolder }"
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
      @click="handleClick"
    >
      <!-- 展开/折叠图标 -->
      <span v-if="isFolder" class="expand-icon" :class="{ expanded: node.isExpanded }">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>
      <span v-else class="expand-icon placeholder"></span>
      
      <!-- 文件/文件夹图标 -->
      <span class="node-icon" :class="iconClass">
        <!-- 文件夹 -->
        <svg v-if="isFolder" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <!-- 任务文件 -->
        <svg v-else-if="isTaskFile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <!-- Markdown -->
        <svg v-else-if="isMdFile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <!-- 代码文件 -->
        <svg v-else-if="isCodeFile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        <!-- 图片 -->
        <svg v-else-if="isImageFile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <!-- JSON/配置 -->
        <svg v-else-if="isConfigFile" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <!-- 默认文件 -->
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </span>
      
      <!-- 节点名称 -->
      <span class="node-name">{{ displayName }}</span>
      
      <!-- 进度徽章 -->
      <span v-if="node.progress" class="progress-badge" :class="progressClass">
        {{ node.progress.completed }}/{{ node.progress.total }}
      </span>
    </div>
    
    <!-- 子节点 -->
    <div v-if="isFolder && node.isExpanded && node.children" class="children">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-path="selectedPath"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TreeNode as TreeNodeType } from '../types'

const props = defineProps<{
  node: TreeNodeType
  depth: number
  selectedPath: string
}>()

const emit = defineEmits<{
  'select': [node: TreeNodeType]
  'toggle': [node: TreeNodeType]
}>()

const isFolder = computed(() => props.node.type === 'folder')
const isSelected = computed(() => props.node.path === props.selectedPath)
const isTaskFile = computed(() => props.node.name === 'tasks.md')
const isMdFile = computed(() => props.node.name.endsWith('.md') && !isTaskFile.value)
const isCodeFile = computed(() => {
  const ext = props.node.name.split('.').pop()?.toLowerCase()
  return ['js', 'ts', 'vue', 'jsx', 'tsx', 'py', 'java', 'css', 'scss', 'html', 'xml', 'sql', 'sh', 'bat', 'ps1'].includes(ext || '')
})
const isImageFile = computed(() => {
  const ext = props.node.name.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'].includes(ext || '')
})
const isConfigFile = computed(() => {
  const ext = props.node.name.split('.').pop()?.toLowerCase()
  return ['json', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext || '')
})

const iconClass = computed(() => {
  if (isFolder.value) return 'folder'
  if (isTaskFile.value) return 'task'
  if (isMdFile.value) return 'markdown'
  if (isCodeFile.value) return 'code'
  if (isImageFile.value) return 'image'
  if (isConfigFile.value) return 'config'
  return 'file'
})

// 中文显示名称映射
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
  'tests': '测试',
}

const displayName = computed(() => {
  return props.node.displayName || nameMap[props.node.name] || props.node.name
})

const progressClass = computed(() => {
  if (!props.node.progress) return ''
  const { completed, total } = props.node.progress
  if (completed === total) return 'complete'
  if (completed > 0) return 'partial'
  return 'none'
})

function handleClick() {
  if (isFolder.value) {
    emit('toggle', props.node)
  } else {
    emit('select', props.node)
  }
}
</script>

<style scoped>
.tree-node.archived {
  opacity: 0.6;
}

.tree-node.archived .node-name {
  font-style: italic;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  /* 移除 transition 提升性能 */
}

.node-row:hover {
  background: var(--bg-hover);
}

.node-row.selected {
  background: var(--bg-selected);
}

.expand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-secondary);
  /* 移除 transition 提升性能 */
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.expand-icon.placeholder {
  visibility: hidden;
}

.node-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.node-icon.folder { color: #e8a838; }
.node-icon.task { color: #4caf50; }
.node-icon.markdown { color: #42a5f5; }
.node-icon.code { color: #ab47bc; }
.node-icon.image { color: #26a69a; }
.node-icon.config { color: #78909c; }

.node-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.progress-badge.complete {
  background: var(--success-bg);
  color: var(--success-color);
}

.progress-badge.partial {
  background: var(--warning-bg);
  color: var(--warning-color);
}

.children {
  /* 子节点容器 */
}
</style>
