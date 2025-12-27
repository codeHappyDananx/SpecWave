<template>
  <div class="markdown-surface-root" ref="rootRef"></div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FileContent } from '../types'
import { EditorState, Prec } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'
import { defaultKeymap, history, redo, undo } from '@codemirror/commands'
import { search, openSearchPanel } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language'
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view'

const props = defineProps<{
  file: FileContent
  projectPath: string
  mode: 'view' | 'editor'
  showLineNumbers: boolean
}>()

const emit = defineEmits<{
  (e: 'save-status', status: 'saving' | 'saved' | 'error' | null): void
  (e: 'saved', content: string): void
  (e: 'doc-changed', content: string): void
}>()

const rootRef = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null

const tableColumnWidths = ref<Map<number, string[]>>(new Map())
const resizingState = ref<{
  headerLineNo: number
  colIndex: number
  startX: number
  startWidth: number
  initialWidths: string[]
} | null>(null)

function handleTableMouseDown(event: MouseEvent, view: EditorView) {
  const target = event.target as HTMLElement
  if (!target.classList.contains('cm-md-table-cell')) return false
  const row = target.parentElement
  if (!row || !row.classList.contains('cm-md-table-row-header')) return false

  const rect = target.getBoundingClientRect()
  if (rect.right - event.clientX <= 5) {
    event.preventDefault()
    const pos = view.posAtDOM(target)
    const line = view.state.doc.lineAt(pos)
    
    // Use filtered children to ensure we only get cells (ignoring hidden pipes/markers)
    const cells = Array.from(row.children).filter(c => c.classList.contains('cm-md-table-cell'))
    const colIndex = cells.indexOf(target)
    
    // Initialize widths from current DOM state (don't write to ref yet, wait for drag)
    const widths = cells.map(c => {
      const r = c.getBoundingClientRect()
      return `${r.width}px`
    })
    
    resizingState.value = {
      headerLineNo: line.number,
      colIndex,
      startX: event.clientX,
      startWidth: rect.width,
      initialWidths: widths
    }
    
    document.addEventListener('mousemove', handleTableMouseMove)
    document.addEventListener('mouseup', handleTableMouseUp)
    return true
  }
  return false
}

function handleTableMouseMove(event: MouseEvent) {
  if (!resizingState.value || !view) return
  
  const { headerLineNo, colIndex, startX, startWidth, initialWidths } = resizingState.value
  const delta = event.clientX - startX
  const newWidth = Math.max(30, startWidth + delta)
  
  const newWidths = [...initialWidths]
  newWidths[colIndex] = `${newWidth}px`
  tableColumnWidths.value.set(headerLineNo, newWidths)
  
  // Force update to apply new widths
  view.dispatch({ userEvent: 'resize' })
}

function handleTableMouseUp() {
  resizingState.value = null
  document.removeEventListener('mousemove', handleTableMouseMove)
  document.removeEventListener('mouseup', handleTableMouseUp)
}

const isMarkdownFile = computed(() => props.file.name.toLowerCase().endsWith('.md'))

function normalizeDocText(text: string): string {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

class BulletWidget extends WidgetType {
  private readonly text: string

  constructor(text: string) {
    super()
    this.text = text
  }

  eq(other: BulletWidget) {
    return other.text === this.text
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = this.text
    return span
  }

  ignoreEvent() {
    return true
  }
}

class CheckboxWidget extends WidgetType {
  private readonly checked: boolean

  constructor(checked: boolean) {
    super()
    this.checked = checked
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-checkbox'
    span.textContent = this.checked ? '☑' : '☐'
    return span
  }

  ignoreEvent() {
    return true
  }
}

function isTableSeparatorLine(text: string): boolean {
  const line = String(text || '').trim()
  if (!line) return false
  // Examples:
  // | --- | --- |
  // --- | :---: | ---:
  return /^(\|?\s*:?-{3,}:?\s*)+(\|)?$/.test(line.replace(/\s*\|\s*/g, '|'))
}

function scanTableRowDelimiters(row: string, onDelimiter: (indexInRow: number) => void): void {
  let escaping = false
  let codeFenceLen: number | null = null

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]

    if (escaping) {
      escaping = false
      continue
    }
    if (ch === '\\') {
      escaping = true
      continue
    }

    if (ch === '`') {
      let run = 1
      while (i + run < row.length && row[i + run] === '`') run += 1

      if (codeFenceLen == null) {
        codeFenceLen = run
      } else if (run === codeFenceLen) {
        codeFenceLen = null
      }

      i += run - 1
      continue
    }

    if (codeFenceLen != null) continue
    if (ch === '|') onDelimiter(i)
  }
}

function splitTableRow(text: string): string[] {
  let row = String(text || '').trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|')) row = row.slice(0, -1)
  const parts: string[] = []
  let current = ''
  let last = 0
  scanTableRowDelimiters(row, (idx) => {
    current += row.slice(last, idx)
    parts.push(current.trim())
    current = ''
    last = idx + 1
  })
  current += row.slice(last)
  parts.push(current.trim())
  return parts
}

type TableCellRange = {
  segmentFrom: number
  segmentTo: number
  contentFrom: number
  contentTo: number
}

function getUnescapedPipeIndices(text: string): number[] {
  const indices: number[] = []
  scanTableRowDelimiters(String(text ?? ''), (idx) => indices.push(idx))
  return indices
}

function getTableRowCellRanges(text: string): TableCellRange[] {
  const line = String(text ?? '')
  const firstNonSpace = line.search(/\S/)
  if (firstNonSpace === -1) return []
  const lastNonSpace = (() => {
    for (let i = line.length - 1; i >= 0; i--) {
      if (line[i] !== ' ' && line[i] !== '\t') return i
    }
    return -1
  })()
  if (lastNonSpace === -1) return []

  const start = line[firstNonSpace] === '|' ? firstNonSpace + 1 : firstNonSpace
  const end = line[lastNonSpace] === '|' ? lastNonSpace : lastNonSpace + 1
  if (end < start) return []

  const ranges: TableCellRange[] = []
  let segmentStart = start
  const slice = line.slice(start, end)
  const delimiterOffsets: number[] = []
  scanTableRowDelimiters(slice, (idx) => delimiterOffsets.push(idx))

  const delimiterPositions = delimiterOffsets.map((off) => start + off)
  delimiterPositions.push(end) // sentinel at end

  for (const delimiterPos of delimiterPositions) {
    const segmentFrom = segmentStart
    const segmentTo = delimiterPos
    let contentFrom = segmentFrom
    let contentTo = segmentTo
    while (contentFrom < contentTo && (line[contentFrom] === ' ' || line[contentFrom] === '\t')) contentFrom += 1
    while (contentTo > contentFrom && (line[contentTo - 1] === ' ' || line[contentTo - 1] === '\t')) contentTo -= 1

    ranges.push({ segmentFrom, segmentTo, contentFrom, contentTo })
    segmentStart = delimiterPos + 1
  }
  return ranges
}

function parseTableAlignment(separatorLine: string, columns: number): Array<'left' | 'center' | 'right'> {
  const cells = splitTableRow(separatorLine)
  const aligns: Array<'left' | 'center' | 'right'> = []
  for (let i = 0; i < Math.max(columns, cells.length); i++) {
    const raw = (cells[i] ?? '').trim()
    const left = raw.startsWith(':')
    const right = raw.endsWith(':')
    aligns.push(left && right ? 'center' : right ? 'right' : 'left')
  }
  return aligns.slice(0, columns)
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function buildTableTemplateColumns(rows: string[][]): string {
  const colCount = rows.reduce((acc, row) => Math.max(acc, row.length), 0)
  const maxLens = new Array(colCount).fill(0)
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const len = (row[i] ?? '').length
      if (len > maxLens[i]) maxLens[i] = len
    }
  }
  const cols = maxLens.map((len) => {
    const width = clampNumber(len + 2, 6, 32)
    return `${width}ch`
  })
  return cols.join(' ')
}

class TableRowWidget extends WidgetType {
  private readonly cells: string[]
  private readonly templateColumns: string
  private readonly aligns: Array<'left' | 'center' | 'right'>
  private readonly variant: 'header' | 'body' | 'divider'

  constructor(options: {
    cells: string[]
    templateColumns: string
    aligns: Array<'left' | 'center' | 'right'>
    variant: 'header' | 'body' | 'divider'
  }) {
    super()
    this.cells = options.cells
    this.templateColumns = options.templateColumns
    this.aligns = options.aligns
    this.variant = options.variant
  }

  eq(other: TableRowWidget) {
    return (
      other.variant === this.variant &&
      other.templateColumns === this.templateColumns &&
      other.cells.join('\u0001') === this.cells.join('\u0001') &&
      other.aligns.join('|') === this.aligns.join('|')
    )
  }

  toDOM() {
    const row = document.createElement('div')
    row.className = `cm-md-table-row cm-md-table-row-${this.variant}`
    row.style.gridTemplateColumns = this.templateColumns

    if (this.variant === 'divider') {
      row.setAttribute('aria-hidden', 'true')
      // Add spacer to force grid width calculation for fit-content
      const spacer = document.createElement('div')
      spacer.style.gridColumn = '1 / -1'
      spacer.style.padding = '0'
      spacer.style.height = '0'
      row.appendChild(spacer)
      return row
    }

    const colCount = this.templateColumns.split(' ').length
    for (let i = 0; i < colCount; i++) {
      const cell = document.createElement('div')
      cell.className = 'cm-md-table-cell'
      const align = this.aligns[i] || 'left'
      cell.dataset.align = align
      cell.textContent = this.cells[i] ?? ''
      row.appendChild(cell)
    }
    return row
  }
}

function getActiveLineNumbers(state: EditorState): Set<number> {
  const active = new Set<number>()
  const { doc } = state
  for (const range of state.selection.ranges) {
    const fromLine = doc.lineAt(range.from).number
    const toLine = doc.lineAt(range.to).number
    for (let lineNo = fromLine; lineNo <= toLine; lineNo += 1) {
      active.add(lineNo)
    }
  }
  return active
}

function getTaskCheckboxRange(lineText: string): { from: number; to: number; checked: boolean } | null {
  const match = lineText.match(/^(\s*)([-*+]|\d+\.)\s+\[([ xX])\]\s+/)
  if (!match) return null
  const checked = match[3].toLowerCase() === 'x'
  const boxMatch = match[0].match(/\[([ xX])\]\s+/)
  if (!boxMatch) return null
  const boxFrom = match[0].indexOf('[')
  const boxTo = boxFrom + boxMatch[0].length
  if (boxFrom < 0 || boxTo <= boxFrom) return null
  return { from: boxFrom, to: boxTo, checked }
}

function getSemanticRange(view: EditorView, pos: number): { from: number; to: number } | null {
  const { state } = view
  const { doc } = state
  const tree = syntaxTree(state)
  let node = tree.resolveInner(pos, -1)

  const line = doc.lineAt(pos)
  const lineText = line.text
  const posInLine = pos - line.from

  // 表格单元格：双击优先选中 cell 可见文本（必要时回退到 cell 段）
  if (
    lineText.includes('|') &&
    lineText.trim().length > 0 &&
    !lineText.trimStart().startsWith('```') &&
    !isTableSeparatorLine(lineText)
  ) {
    const isTableRow = (() => {
      const next = line.number < doc.lines ? doc.line(line.number + 1) : null
      if (next && isTableSeparatorLine(next.text)) return true
      for (let n = line.number - 1; n >= 2; n--) {
        const t = doc.line(n).text
        if (t.trim().length === 0) break
        if (t.trimStart().startsWith('```')) break
        if (!t.includes('|') && !isTableSeparatorLine(t)) break
        if (isTableSeparatorLine(t)) {
          const headerText = doc.line(n - 1).text
          if (headerText.includes('|')) return true
          break
        }
      }
      return false
    })()

    if (isTableRow) {
      const cells = getTableRowCellRanges(lineText)
      for (const cell of cells) {
        if (posInLine < cell.segmentFrom || posInLine > cell.segmentTo) continue
        const from = line.from + cell.contentFrom
        const to = line.from + cell.contentTo
        if (to > from) return { from, to }
        return { from: line.from + cell.segmentFrom, to: line.from + cell.segmentTo }
      }
    }
  }

  const listItemMatch = lineText.match(/^(\s*)([-*+]|\d+\.)\s+/)
  const taskMatch = lineText.match(/^(\s*)([-*+]|\d+\.)\s+\[([ xX])\]\s+/)

  for (let cur: any = node; cur; cur = cur.parent) {
    if (cur.name === 'Link') {
      let open: any = null
      let close: any = null
      for (let child = cur.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'LinkMark') continue
        const text = doc.sliceString(child.from, child.to)
        if (text === '[') open = child
        if (text === ']' && !close) close = child
      }
      if (open && close && open.to <= close.from) {
        return { from: open.to, to: close.from }
      }
    }

    if (cur.name === 'StrongEmphasis' || cur.name === 'Emphasis') {
      let first: any = null
      let last: any = null
      for (let child = cur.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'EmphasisMark') continue
        if (!first) first = child
        last = child
      }
      if (first && last && first.to <= last.from) {
        return { from: first.to, to: last.from }
      }
    }

    if (cur.name === 'InlineCode') {
      let first: any = null
      let last: any = null
      for (let child = cur.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'CodeMark') continue
        if (!first) first = child
        last = child
      }
      if (first && last && first.to <= last.from) {
        return { from: first.to, to: last.from }
      }
    }
  }

  return null
}

function buildTyporaDecorations(view: EditorView): DecorationSet {
  if (props.mode !== 'view') return Decoration.none

  const { state } = view
  const { doc } = state
  const activeLines = getActiveLineNumbers(state)

  const syntaxMark = Decoration.mark({ class: 'cm-md-syntax' })
  const strongMark = Decoration.mark({ class: 'cm-md-strong' })
  const emphasisMark = Decoration.mark({ class: 'cm-md-em' })
  const linkTextMark = Decoration.mark({ class: 'cm-md-link' })
  const hide = Decoration.mark({ class: 'cm-md-hidden' })
  const tableHide = Decoration.mark({ class: 'cm-md-table-hide' })
  const tableCellLeft = Decoration.mark({ class: 'cm-md-table-cell', attributes: { 'data-align': 'left' } })
  const tableCellCenter = Decoration.mark({ class: 'cm-md-table-cell', attributes: { 'data-align': 'center' } })
  const tableCellRight = Decoration.mark({ class: 'cm-md-table-cell', attributes: { 'data-align': 'right' } })

  type DecorationItem = { from: number; to: number; deco: Decoration }
  const items: DecorationItem[] = []
  const push = (from: number, to: number, deco: Decoration) => {
    if (to < from) return
    items.push({ from, to, deco })
  }

  const hiddenTableLineRanges: Array<{ from: number; to: number }> = []
  const isInHiddenTableLine = (pos: number): boolean => {
    for (const r of hiddenTableLineRanges) {
      if (pos >= r.from && pos <= r.to) return true
    }
    return false
  }

  // 表格投影：把 pipe 表格渲染成 grid 行；表格仍保持可编辑（源文本为真相）
  const processedTableStarts = new Set<number>()
  const findTableStartFrom = (lineNo: number): { headerLineNo: number; separatorLineNo: number } | null => {
    const current = doc.line(lineNo)
    const currentText = current.text
    const next = lineNo < doc.lines ? doc.line(lineNo + 1) : null
    if (
      next &&
      currentText.includes('|') &&
      currentText.trim().length > 0 &&
      !currentText.trimStart().startsWith('```') &&
      isTableSeparatorLine(next.text)
    ) {
      return { headerLineNo: lineNo, separatorLineNo: lineNo + 1 }
    }

    for (let n = lineNo; n >= 2; n--) {
      const t = doc.line(n).text
      if (t.trim().length === 0) break
      if (t.trimStart().startsWith('```')) break
      if (!t.includes('|') && !isTableSeparatorLine(t)) break
      if (isTableSeparatorLine(t)) {
        const headerText = doc.line(n - 1).text
        if (headerText.includes('|') && headerText.trim().length > 0 && !headerText.trimStart().startsWith('```')) {
          return { headerLineNo: n - 1, separatorLineNo: n }
        }
        break
      }
    }
    return null
  }

  const visibleWindow = (() => {
    if (!view.visibleRanges || view.visibleRanges.length === 0) return null
    const first = view.visibleRanges[0]
    const last = view.visibleRanges[view.visibleRanges.length - 1]
    return { from: first.from, to: last.to }
  })()

  for (const range of view.visibleRanges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = doc.lineAt(pos)
      const text = line.text
      const looksTableish =
        (text.includes('|') || isTableSeparatorLine(text)) && text.trim().length > 0 && !text.trimStart().startsWith('```')
      if (!looksTableish) {
        pos = line.to + 1
        continue
      }

      const start = findTableStartFrom(line.number)
      if (!start) {
        pos = line.to + 1
        continue
      }

      if (processedTableStarts.has(start.headerLineNo)) {
        pos = line.to + 1
        continue
      }
      processedTableStarts.add(start.headerLineNo)

      const headerLine = doc.line(start.headerLineNo)
      const separatorLine = doc.line(start.separatorLineNo)

      let endLineNo = separatorLine.number
      const rows: string[][] = [splitTableRow(headerLine.text)]
      const separatorCells = splitTableRow(separatorLine.text)
      const colCount = Math.max(rows[0].length, separatorCells.length)
      const aligns = parseTableAlignment(separatorLine.text, colCount)

      const bodyRows: string[][] = []
      let scanPos = separatorLine.to + 1
      while (scanPos <= doc.length) {
        const rowLine = doc.lineAt(scanPos)
        const rowText = rowLine.text
        if (!rowText.includes('|') || rowText.trim().length === 0) break
        if (rowText.trimStart().startsWith('```')) break
        bodyRows.push(splitTableRow(rowText))
        endLineNo = rowLine.number
        scanPos = rowLine.to + 1
      }
      rows.push(...bodyRows)

      const savedWidths = tableColumnWidths.value.get(start.headerLineNo)
      const templateColumns = savedWidths ? savedWidths.join(' ') : buildTableTemplateColumns(rows)
      const tableColCount = aligns.length
      const pipeHide = tableHide

       const applyTableLine = (rowLine: any, variant: 'header' | 'body', rowIndex?: number) => {
         if (visibleWindow && (rowLine.to < visibleWindow.from || rowLine.from > visibleWindow.to)) return

         const stripeClass = variant === 'body' && (rowIndex ?? 0) % 2 === 1 ? ' cm-md-table-row-even' : ''
         push(
           rowLine.from,
           rowLine.from,
           Decoration.line({
             attributes: {
              class: `cm-md-table-row cm-md-table-row-${variant} cm-md-table-cols-${Math.min(
                10,
                Math.max(1, tableColCount)
              )}${stripeClass}`,
              style: `grid-template-columns: ${templateColumns};`
             }
           })
         )

        const rowText = String(rowLine.text ?? '')
        const firstNonSpace = rowText.search(/\S/)
        if (firstNonSpace > 0) {
          push(rowLine.from, rowLine.from + firstNonSpace, pipeHide)
        }
        const lastNonSpace = (() => {
          for (let i = rowText.length - 1; i >= 0; i--) {
            if (rowText[i] !== ' ' && rowText[i] !== '\t') return i
          }
          return -1
        })()
        if (lastNonSpace >= 0 && lastNonSpace + 1 < rowText.length) {
          push(rowLine.from + lastNonSpace + 1, rowLine.from + rowText.length, pipeHide)
        }

        const pipes = getUnescapedPipeIndices(rowLine.text)
        for (const idx of pipes) {
          const from = rowLine.from + idx
          push(from, from + 1, pipeHide)
        }

        const cells = getTableRowCellRanges(rowLine.text)
        for (let i = 0; i < Math.min(cells.length, aligns.length); i++) {
          const cell = cells[i]
          const mark = aligns[i] === 'center' ? tableCellCenter : aligns[i] === 'right' ? tableCellRight : tableCellLeft
          if (cell.contentTo > cell.contentFrom) {
            if (cell.segmentFrom < cell.contentFrom) {
              push(rowLine.from + cell.segmentFrom, rowLine.from + cell.contentFrom, pipeHide)
            }
            if (cell.contentTo < cell.segmentTo) {
              push(rowLine.from + cell.contentTo, rowLine.from + cell.segmentTo, pipeHide)
            }
            push(rowLine.from + cell.contentFrom, rowLine.from + cell.contentTo, mark)
          } else {
            // 空 cell：保留一个可见占位（用空白承载样式），并避免把整个段隐藏掉
            if (cell.segmentTo > cell.segmentFrom) {
              // 不隐藏 padding，否则 grid 会被“空 item”打乱
              push(rowLine.from + cell.segmentFrom, rowLine.from + cell.segmentTo, mark)
            }
          }
        }
      }

      applyTableLine(headerLine, 'header')
      hiddenTableLineRanges.push({ from: headerLine.from, to: headerLine.to })

      push(
        separatorLine.from,
        separatorLine.to,
        Decoration.replace({
          widget: new TableRowWidget({
            cells: [],
            templateColumns,
            aligns,
            variant: 'divider'
          })
        })
      )
      push(
        separatorLine.from,
        separatorLine.from,
        Decoration.line({ attributes: { class: 'cm-md-table-row-divider-line' } })
      )
      hiddenTableLineRanges.push({ from: separatorLine.from, to: separatorLine.to })

      let bodyLineNo = separatorLine.number + 1
      for (let i = 0; i < bodyRows.length; i++) {
        const rowLine = doc.line(bodyLineNo)
        applyTableLine(rowLine, 'body', i)
        hiddenTableLineRanges.push({ from: rowLine.from, to: rowLine.to })
        bodyLineNo += 1
      }

      pos = doc.line(endLineNo).to + 1
    }
  }

  // 任务 checkbox：始终以视图投影替换（不随光标行显示源码）
  for (const range of view.visibleRanges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = doc.lineAt(pos)
      const task = getTaskCheckboxRange(line.text)
      if (task) {
        const from = line.from + task.from
        const to = line.from + task.to
        push(from, to, Decoration.replace({ widget: new CheckboxWidget(task.checked) }))
      }
      pos = line.to + 1
    }
  }

  const tree = syntaxTree(state)
  for (const visible of view.visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter(ref) {
        if (hiddenTableLineRanges.length > 0 && isInHiddenTableLine(ref.from)) {
          return
        }
        const lineNo = doc.lineAt(ref.from).number
        const isActiveLine = activeLines.has(lineNo)

        if (ref.name === 'StrongEmphasis') {
          let first: any = null
          let last: any = null
          for (let child = ref.node.firstChild; child; child = child.nextSibling) {
            if (child.name !== 'EmphasisMark') continue
            if (!first) first = child
            last = child
          }
          if (first && last && first.to <= last.from) {
            push(first.to, last.from, strongMark)
          }
          return
        }

        if (ref.name === 'Emphasis') {
          let first: any = null
          let last: any = null
          for (let child = ref.node.firstChild; child; child = child.nextSibling) {
            if (child.name !== 'EmphasisMark') continue
            if (!first) first = child
            last = child
          }
          if (first && last && first.to <= last.from) {
            push(first.to, last.from, emphasisMark)
          }
          return
        }

        if (ref.name === 'Link') {
          let open: any = null
          let close: any = null
          for (let child = ref.node.firstChild; child; child = child.nextSibling) {
            if (child.name !== 'LinkMark') continue
            const text = doc.sliceString(child.from, child.to)
            if (text === '[') open = child
            if (text === ']' && !close) close = child
          }
          if (open && close && open.to <= close.from) {
            push(open.to, close.from, linkTextMark)
          }
          // 继续向下处理 LinkMark / URL 的语法显隐
        }

        const headingMatch = ref.name.match(/^ATXHeading([1-6])$/)
        if (headingMatch) {
          const level = Number(headingMatch[1])
          const line = doc.lineAt(ref.from)
          push(
            line.from,
            line.from,
            Decoration.line({ attributes: { class: `cm-md-heading cm-md-heading-${level}` } })
          )
          return
        }

        if (
          ref.name !== 'HeaderMark' &&
          ref.name !== 'ListMark' &&
          ref.name !== 'QuoteMark' &&
          ref.name !== 'EmphasisMark' &&
          ref.name !== 'LinkMark' &&
          ref.name !== 'URL' &&
          ref.name !== 'CodeMark'
        ) {
          return
        }

        const text = doc.sliceString(ref.from, ref.to)
        if (ref.name !== 'ListMark') {
          push(ref.from, ref.to, syntaxMark)
        }

        if (isActiveLine && ref.name !== 'ListMark' && ref.name !== 'QuoteMark') {
          return
        }

        if (ref.name === 'HeaderMark') {
          let to = ref.to
          while (to < doc.length && doc.sliceString(to, to + 1) === ' ') to += 1
          if (!isActiveLine) {
            push(ref.from, to, hide)
          } else {
            push(ref.from, ref.to, syntaxMark)
          }
          return
        }

        if (ref.name === 'QuoteMark') {
          const line = doc.lineAt(ref.from)
          push(line.from, line.from, Decoration.line({ attributes: { class: 'cm-md-blockquote' } }))
          let to = ref.to
          if (doc.sliceString(to, to + 1) === ' ') to += 1
          if (!isActiveLine) push(ref.from, to, hide)
          return
        }

        if (ref.name === 'ListMark') {
          // Ordered list 的编号是视图内容，不隐藏；Bullet list 才替换为 •（任务行除外）
          const line = doc.lineAt(ref.from)
          const task = getTaskCheckboxRange(line.text)
          if (task) {
            let to = ref.to
            if (doc.sliceString(to, to + 1) === ' ') to += 1
            push(ref.from, to, hide)
            return
          }

          if (text === '-' || text === '*' || text === '+') {
            let to = ref.to
            if (doc.sliceString(to, to + 1) === ' ') to += 1
            push(ref.from, to, Decoration.replace({ widget: new BulletWidget('•') }))
          }
          return
        }

        if (!isActiveLine) {
          push(ref.from, ref.to, hide)
        }
      }
    })
  }

  const ranges = items.map((item) => item.deco.range(item.from, item.to))
  return Decoration.set(ranges, true)
}

const typoraPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTyporaDecorations(view)
    }

    update(update: any) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((tr: any) => tr.isUserEvent('resize'))) {
        this.decorations = buildTyporaDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

const baseTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--bg-app)',
      color: 'var(--text-primary)'
    },
    '.cm-editor': {
      backgroundColor: 'var(--bg-app)'
    },
    '.cm-scroller': {
      height: '100%',
      fontFamily: '"Consolas", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
      fontSize: '15px',
      lineHeight: '1.7',
      padding: '32px 32px 32px 0',
      boxSizing: 'border-box',
      overflow: 'auto'
    },
    '.cm-content': {
      width: 'max-content',
      minWidth: '100%',
      paddingLeft: '24px'
    },
    '.cm-line': {
      padding: '0 8px 0 0'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      position: 'sticky',
      left: '0',
      zIndex: '3'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 12px',
      minWidth: '40px',
      boxSizing: 'border-box',
      textAlign: 'right'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-secondary)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-secondary)'
    },
    '.cm-md-syntax': {
      opacity: '0.35'
    },
    '.cm-md-hidden': {
      display: 'none'
    },
    '.cm-md-heading': {
      fontWeight: 'bold',
      color: 'var(--text-primary)',
      textDecoration: 'none !important',
      border: 'none !important',
      boxShadow: 'none !important'
    },
    '.cm-md-heading *': {
      textDecoration: 'none !important',
      borderBottom: 'none !important'
    },
    '.cm-md-heading::after, .cm-md-heading::before': {
      display: 'none !important',
      content: 'none !important'
    },
    '.cm-line.cm-md-heading-1': { 
      fontSize: '2em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0'
    },
    '.cm-line.cm-md-heading-2': { 
      fontSize: '1.5em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0'
    },
    '.cm-line.cm-md-heading-3': { 
      fontSize: '1.25em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0'
    },
    '.cm-line.cm-md-heading-4': { 
      fontSize: '1.1em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0'
    },
    '.cm-line.cm-md-heading-5': { 
      fontSize: '1em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0'
    },
    '.cm-line.cm-md-heading-6': { 
      fontSize: '1em', 
      lineHeight: '1.3', 
      paddingTop: '20px', 
      paddingBottom: '10px',
      marginTop: '0',
      marginBottom: '0',
      color: 'var(--text-secondary)' 
    },
    '.cm-md-blockquote': {
      borderLeft: '3px solid var(--border-color)',
      paddingLeft: '14px',
      color: 'var(--text-secondary)'
    },
    '.cm-md-strong': {
      fontWeight: '650'
    },
    '.cm-md-em': {
      fontStyle: 'italic'
    },
    '.cm-md-link': {
      color: 'var(--accent-color)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px'
    },
    '.cm-md-bullet': {
      display: 'inline-block',
      width: '18px',
      textAlign: 'center',
      color: 'var(--text-tertiary)',
      transform: 'translateY(-1px)'
    },
    '.cm-md-checkbox': {
      display: 'inline-block',
      width: '18px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
      transform: 'translateY(-1px)',
      userSelect: 'none'
    },
    '.cm-gutterElement': {
      color: 'var(--text-tertiary)'
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 215, 94, 0.65)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(47, 111, 235, 0.85)',
      color: '#fff'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(184, 214, 255, 0.6) !important'
    }
  },
  { dark: false }
)

function buildExtensions() {
  const extensions = [
    baseTheme,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    history(),
    search({
      scrollToMatch(range, _view) {
        return EditorView.scrollIntoView(range.from, { x: 'nearest', y: 'nearest' })
      }
    }),
    keymap.of(defaultKeymap),
    Prec.high(
      keymap.of([
        {
          key: 'Mod-f',
          run(target) {
            openSearchPanel(target)
            return true
          }
        },
        {
          key: 'Mod-z',
          run: undo
        },
        {
          key: 'Mod-y',
          run: redo
        },
        {
          key: 'Shift-Mod-z',
          run: redo
        },
        {
          key: 'Mod-s',
          run() {
            void save()
            return true
          }
        }
      ])
    )
  ]

  if (props.mode === 'view') {
    extensions.push(
      typoraPlugin,
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
           if (handleTableMouseDown(event, view)) return true
           return false
        },
        dblclick(event, view) {
          const mouse = event as MouseEvent
          const pos = view.posAtCoords({ x: mouse.clientX, y: mouse.clientY })
          if (pos == null) return false
          const range = getSemanticRange(view, pos)
          if (!range) return false
          view.dispatch({
            selection: { anchor: range.from, head: range.to },
            scrollIntoView: true
          })
          return true
        }
      })
    )
  }

  if (props.showLineNumbers) {
    extensions.push(
      lineNumbers({
        formatNumber: (lineNo, state) => {
          try {
            if (props.mode === 'view') {
              if (lineNo < 1 || lineNo > state.doc.lines) return String(lineNo)
              const line = state.doc.line(lineNo)
              const text = line.text
              if (isTableSeparatorLine(text) && !text.trimStart().startsWith('```')) {
                // Check previous line for header to confirm it's a table separator
                if (lineNo > 1) {
                  const prevLine = state.doc.line(lineNo - 1)
                  if (prevLine.text.includes('|') && !prevLine.text.trimStart().startsWith('```')) {
                    return ''
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error formatting line number:', e)
          }
          return String(lineNo)
        }
      }),
      highlightActiveLineGutter()
    )
  }

  if (isMarkdownFile.value) {
    extensions.push(markdown())
  }

  return extensions
}

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: buildExtensions()
  })
}

function ensureView() {
  const parent = rootRef.value
  if (!parent) return
  if (view) return

  view = new EditorView({
    state: createState(normalizeDocText(props.file.content || '')),
    parent,
    dispatch: (tr) => {
      if (!view) return
      view.update([tr])
      if (tr.docChanged) {
        emit('doc-changed', view.state.doc.toString())
      }
    }
  })
}

function destroyView() {
  view?.destroy()
  view = null
}

function openFind() {
  if (!view) return
  openSearchPanel(view)
}

function getText(): string {
  return view?.state.doc.toString() ?? props.file.content ?? ''
}

function setText(nextText: string) {
  if (!view) return
  const current = view.state.doc.toString()
  const normalized = normalizeDocText(nextText)
  if (current === normalized) return
  view.dispatch({
    changes: { from: 0, to: current.length, insert: normalized }
  })
}

function applyEdits(edits: Array<{ from: number; to: number; insert: string }>, options?: { scrollIntoView?: boolean }) {
  if (!view) return false
  const changes = edits.map((e) => ({ from: e.from, to: e.to, insert: e.insert }))
  view.dispatch({
    changes,
    scrollIntoView: options?.scrollIntoView === true
  })
  return true
}

function undoOnce() {
  if (!view) return false
  return undo(view)
}

function redoOnce() {
  if (!view) return false
  return redo(view)
}

async function save() {
  if (!view) return
  if (!window.electronAPI) {
    emit('save-status', 'error')
    window.setTimeout(() => emit('save-status', null), 2000)
    return
  }
  emit('save-status', 'saving')
  try {
    const content = view.state.doc.toString()
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

defineExpose({ openFind, save, undoOnce, redoOnce, getText, setText, applyEdits })

onMounted(() => {
  ensureView()
})

onBeforeUnmount(() => {
  destroyView()
})

watch(
  () => [props.file.path, props.file.content] as const,
  async ([nextPath, nextContent], [prevPath]) => {
    await nextTick()
    if (!view) {
      ensureView()
      return
    }
    // Debug font family
    const scroller = rootRef.value?.querySelector('.cm-scroller')
    if (scroller) {
      const style = window.getComputedStyle(scroller)
      console.log('Current Font Family:', style.fontFamily)
    }

    if (nextPath !== prevPath) {
      view.setState(createState(normalizeDocText(nextContent || '')))
      return
    }
    if (typeof nextContent === 'string') {
      setText(nextContent)
    }
  }
)

watch(
  () => [props.mode, props.showLineNumbers, isMarkdownFile.value] as const,
  async () => {
    await nextTick()
    if (!view) return
    const doc = view.state.doc.toString()
    view.setState(createState(doc))
  }
)
</script>

<style scoped>
.markdown-surface-root {
  width: 100%;
  height: 100%;
  min-height: 0;
}

:global(.cm-md-table-row) {
  /* Stronger borders: mix text color to make it deeper/darker */
  --cm-md-table-border: color-mix(in srgb, var(--text-primary) 25%, var(--border-color));
  --cm-md-table-grid: color-mix(in srgb, var(--text-primary) 25%, var(--border-color));
  display: grid;
  width: fit-content;
  align-items: stretch;
  gap: 0;
  border-left: 1px solid var(--cm-md-table-border);
  border-right: 1px solid var(--cm-md-table-border);
  background: var(--bg-app);
}

:global(.cm-md-table-hide) {
  display: none !important;
}

:global(.cm-line.cm-md-table-row) {
  padding: 0 0 0 12px !important; /* Add left padding to prevent gutter overlap */
  display: grid !important;
}

:global(.cm-line.cm-md-table-row span:not(.cm-md-table-cell)) {
  display: contents;
}

:global(.cm-md-table-row-header) {
  background: var(--bg-secondary);
  border-top: 1px solid var(--cm-md-table-border);
  border-bottom: 1px solid var(--cm-md-table-border);
}

:global(.cm-md-table-row-header > .cm-md-table-cell) {
  font-weight: 650;
}

:global(.cm-md-table-row-body) {
  background: var(--bg-app);
  border-bottom: 1px solid var(--cm-md-table-border);
}

:global(.cm-md-table-cols-1) { grid-template-columns: repeat(1, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-2) { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-3) { grid-template-columns: repeat(3, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-4) { grid-template-columns: repeat(4, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-5) { grid-template-columns: repeat(5, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-6) { grid-template-columns: repeat(6, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-7) { grid-template-columns: repeat(7, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-8) { grid-template-columns: repeat(8, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-9) { grid-template-columns: repeat(9, minmax(180px, 1fr)); }
:global(.cm-md-table-cols-10) { grid-template-columns: repeat(10, minmax(180px, 1fr)); }

:global(.cm-line.cm-md-table-row-body:hover) {
  background: var(--bg-hover);
}

:global(.cm-md-table-row-even) {
  background-color: color-mix(in srgb, var(--bg-secondary) 50%, var(--bg-app));
}

:global(.cm-md-table-row-divider) {
  display: none;
}

:global(.cm-md-table-row-divider-line) {
  padding: 0 !important;
  line-height: 0 !important;
  font-size: 0 !important;
}

:global(.cm-md-table-cell) {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-right: 1px solid var(--cm-md-table-grid);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  min-width: 0;
  position: relative;
}

:global(.cm-md-table-cell:last-child) {
  border-right: none;
}

:global(.cm-md-table-row-header .cm-md-table-cell::after) {
  content: '';
  position: absolute;
  top: 0;
  right: -1px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

:global(.cm-md-table-row > .cm-md-table-cell:last-of-type) {
  border-right: none;
}

:global(.cm-md-table-cell[data-align='center']) {
  text-align: center;
}

:global(.cm-md-table-cell[data-align='right']) {
  text-align: right;
}
</style>
