import type { TaskBoardVM, TaskItemVM } from '@specwave/contracts';

export const EMPTY_TASK_DETAIL: TaskBoardVM['detail'] = { isOpen: false, mode: 'view', draftTitle: '', draftBody: '' };

function firstSentence(text: string) {
  const s = text.trim();
  if (!s) return '';
  const idx = s.search(/[。；;.!?]/);
  if (idx < 0) return s;
  return s.slice(0, idx).trim();
}

function extractTaskSummary(blockText: string) {
  const main = blockText.trimEnd().replaceAll('\r\n', '\n');
  const lines = main.split('\n');
  for (const line of lines) {
    const m1 = line.match(/^\s*[-*+]\s*做什么[：:]\s*(.*)$/);
    if (m1?.[1]) return firstSentence(m1[1]);
    const m2 = line.match(/^\s*做什么[：:]\s*(.*)$/);
    if (m2?.[1]) return firstSentence(m2[1]);
  }

  // fallback：取任务块里第一条“有内容”的描述（跳过嵌套任务行）
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^[-*+]\s*\[[ xX]\]\s+/.test(trimmed)) continue;
    const cleaned = trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!cleaned) continue;
    return firstSentence(cleaned);
  }

  return '';
}

function taskIdFromTitle(title: string, fallbackPos: number) {
  const m = title.match(/\bT-\d{3}\b/);
  if (m?.[0]) return `task-${m[0]}`;
  return `task-${fallbackPos}`;
}

function extractTaskDrafts(fullText: string, item: TaskItemVM) {
  const blockText = fullText.slice(item.source.blockStartPos, item.source.blockEndPos);
  const trimmed = blockText.trimEnd();
  const main = trimmed.replaceAll('\r\n', '\n');
  const nlIdx = main.indexOf('\n');
  const body = nlIdx < 0 ? '' : main.slice(nlIdx + 1).trimEnd();
  const title = fullText.slice(item.source.titleStartPos, item.source.titleEndPos).replace(/\r$/, '');
  return { title, body };
}

function parseLinkedRefs(blockText: string): string[] {
  const match = blockText.match(/关联需求[：:]\s*(.+)$/m);
  if (!match?.[1]) return [];

  // 分割并清理，支持中英文逗号和分号
  return match[1]
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter((s) => /^(REQ|AC)-\d+$/.test(s));
}

export function parseTaskBoardV2(text: string, prev: TaskBoardVM | null): TaskBoardVM {
  const items: TaskItemVM[] = [];
  const re = /^(?<indent>[ \t]*)-\s*\[(?<status>[ xX])\]\s+(?<label>.*)$/gm;
  const hits: Array<{
    lineStartPos: number;
    rawLine: string;
    level: number;
    checked: boolean;
    title: string;
    statusPos: number;
    titleStartPos: number;
    titleEndPos: number;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineStartPos = m.index;
    const rawLine = m[0] ?? '';
    const indent = m.groups?.indent ?? '';
    const checked = (m.groups?.status ?? ' ').toLowerCase() === 'x';
    const title = (m.groups?.label ?? '').replace(/\r$/, '');

    const bracketIdx = rawLine.indexOf('[');
    if (bracketIdx < 0) continue;
    const statusPos = lineStartPos + bracketIdx + 1;

    const rawLineNoCr = rawLine.replace(/\r$/, '');
    const titleStartInLine = rawLineNoCr.length - title.length;
    const titleStartPos = lineStartPos + Math.max(0, titleStartInLine);
    const titleEndPos = titleStartPos + title.length;
    const level = Math.max(0, Math.floor(indent.length / 2));

    hits.push({ lineStartPos, rawLine, level, checked, title, statusPos, titleStartPos, titleEndPos });
  }

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const next = (() => {
      for (let j = i + 1; j < hits.length; j++) {
        const cand = hits[j]!;
        if (cand.level <= h.level) return cand;
      }
      return null;
    })();
    const blockStartPos = h.lineStartPos;
    const blockEndPos = next ? next.lineStartPos : text.length;
    const blockText = text.slice(blockStartPos, blockEndPos);
    const body = (() => {
      const main = blockText.trimEnd().replaceAll('\r\n', '\n');
      const nlIdx = main.indexOf('\n');
      if (nlIdx < 0) return '';
      // 移除"关联需求"行，避免与 badge 区域重复显示
      return main
        .slice(nlIdx + 1)
        .split('\n')
        .filter((line) => !/^[-\s]*关联需求[：:]/.test(line))
        .join('\n')
        .trimEnd();
    })();

    items.push({
      id: taskIdFromTitle(h.title, h.statusPos),
      title: h.title,
      summary: extractTaskSummary(blockText),
      body,
      checked: h.checked,
      level: h.level,
      source: {
        statusPos: h.statusPos,
        titleStartPos: h.titleStartPos,
        titleEndPos: h.titleEndPos,
        blockStartPos,
        blockEndPos
      },
      linkedRefs: parseLinkedRefs(blockText)
    });
  }

  const nextDeckMode: TaskBoardVM['deckMode'] = prev?.deckMode ?? 'single';

  const nextActiveTaskId = (() => {
    const prevId = prev?.activeTaskId;
    if (prevId && items.some((t) => t.id === prevId)) return prevId;
    return items[0]?.id ?? null;
  })();

  const nextDetail = (() => {
    if (!nextActiveTaskId) return EMPTY_TASK_DETAIL;
    if (!prev?.detail.isOpen) return EMPTY_TASK_DETAIL;
    if (prev.activeTaskId !== nextActiveTaskId) return EMPTY_TASK_DETAIL;
    if (prev.detail.mode === 'edit') return prev.detail;
    const item = items.find((t) => t.id === nextActiveTaskId);
    if (!item) return EMPTY_TASK_DETAIL;
    const { title, body } = extractTaskDrafts(text, item);
    return { isOpen: true, mode: 'view' as const, draftTitle: title, draftBody: body };
  })();

  return {
    items,
    activeTaskId: nextActiveTaskId,
    deckMode: nextDeckMode,
    detail: nextDetail,
    linkedDocs: [],
    linkedDocsLoading: false,
    linkedDocsError: null
  };
}
