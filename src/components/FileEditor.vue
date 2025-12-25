<template>
  <div class="file-editor-root" ref="rootRef"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import type { FileContent } from '../types'
import { useUIStore } from '../stores/ui'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

const props = defineProps<{
  file: FileContent
  projectPath: string
}>()

const emit = defineEmits<{
  (e: 'save-status', status: 'saving' | 'saved' | 'error' | null): void
  (e: 'saved', content: string): void
}>()

const uiStore = useUIStore()
const rootRef = ref<HTMLDivElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null

function ensureWorkers() {
  const selfAny = self as any
  if (selfAny.MonacoEnvironment?.getWorker) return
  selfAny.MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'json') return new JsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
      if (label === 'typescript' || label === 'javascript') return new TsWorker()
      return new EditorWorker()
    }
  }
}

function getEffectiveTheme(): 'light' | 'dark' {
  const root = document.documentElement
  if (root.classList.contains('dark-theme')) return 'dark'
  if (root.classList.contains('light-theme')) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ensureThemes() {
  if ((ensureThemes as any)._done) return
  ;(ensureThemes as any)._done = true

  monaco.editor.defineTheme('specwave-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.findMatchBackground': '#2F6FEB',
      'editor.findMatchHighlightBackground': '#FFD75E',
      'editor.findRangeHighlightBackground': '#FFF0B3',
      'editor.selectionBackground': '#B8D6FF',
      'editor.lineHighlightBackground': '#F7F7F8'
    }
  })

  monaco.editor.defineTheme('specwave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.findMatchBackground': '#2F6FEB',
      'editor.findMatchHighlightBackground': '#A98500',
      'editor.findRangeHighlightBackground': '#5A4A00',
      'editor.selectionBackground': '#2B4B7A',
      'editor.lineHighlightBackground': '#1F2328'
    }
  })
}

const languageId = computed(() => {
  const ft = props.file.fileType || ''
  if (props.file.name.endsWith('.md')) return 'markdown'
  if (ft === 'javascript') return 'javascript'
  if (ft === 'typescript') return 'typescript'
  if (ft === 'json') return 'json'
  if (ft === 'css' || ft === 'scss') return 'css'
  if (ft === 'html' || ft === 'xml') return 'html'
  if (ft === 'python') return 'python'
  if (ft === 'java') return 'java'
  if (ft === 'sql') return 'sql'
  if (ft === 'bash' || ft === 'batch' || ft === 'powershell') return 'shell'
  return 'plaintext'
})

function getThemeName(): string {
  return getEffectiveTheme() === 'dark' ? 'specwave-dark' : 'specwave-light'
}

async function save() {
  if (!editor || !model) return
  if (!window.electronAPI) return

  emit('save-status', 'saving')
  try {
    const content = model.getValue()
    const fullPath = `${props.projectPath}/${props.file.path}`
    const result = await window.electronAPI.saveFile(fullPath, content, {
      encoding: props.file.encoding,
      bom: props.file.bom,
      eol: props.file.eol
    })
    if (result.success) {
      emit('save-status', 'saved')
      emit('saved', content)
      window.setTimeout(() => emit('save-status', null), 2000)
    } else {
      emit('save-status', 'error')
      window.setTimeout(() => emit('save-status', null), 3000)
    }
  } catch {
    emit('save-status', 'error')
    window.setTimeout(() => emit('save-status', null), 3000)
  }
}

function openFind() {
  if (!editor) return
  editor.getAction('actions.find')?.run()
}

defineExpose({ openFind, save })

onMounted(() => {
  ensureWorkers()
  ensureThemes()
  const el = rootRef.value
  if (!el) return

  model = monaco.editor.createModel(props.file.content || '', languageId.value)

  editor = monaco.editor.create(el, {
    model,
    theme: getThemeName(),
    fontFamily: `'Consolas', 'Monaco', monospace`,
    fontSize: 13,
    minimap: { enabled: false },
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderWhitespace: 'selection'
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    save()
  })

  resizeObserver = new ResizeObserver(() => editor?.layout())
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  editor?.dispose()
  editor = null
  model?.dispose()
  model = null
})

watch(
  () => [props.file.path, props.file.content, languageId.value] as const,
  async ([nextPath, nextContent, nextLang]) => {
    await nextTick()
    if (!editor) return

    if (!model || model.uri.path !== `/${nextPath}`) {
      model?.dispose()
      const uri = monaco.Uri.parse(`file:///${nextPath}`)
      model = monaco.editor.createModel(nextContent || '', nextLang, uri)
      editor.setModel(model)
    } else {
      if (model.getValue() !== nextContent) {
        model.setValue(nextContent || '')
      }
      monaco.editor.setModelLanguage(model, nextLang)
    }

    monaco.editor.setTheme(getThemeName())
  }
)

watch(
  () => uiStore.theme,
  () => {
    monaco.editor.setTheme(getThemeName())
  }
)
</script>

<style scoped>
.file-editor-root {
  width: max-content;
  min-width: 100%;
  height: 100%;
}
</style>

