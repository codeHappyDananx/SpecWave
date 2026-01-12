import type { LinkedDocVM } from '@specwave/contracts';

function extractDocSection(
  docText: string,
  refId: string
): { title: string; content: string; lineNumber: number } | null {
  const lines = docText.split('\n');

  if (refId.startsWith('REQ-')) {
    const pattern = new RegExp(`^###\\s+${refId}\\b`);
    const startIdx = lines.findIndex((line) => pattern.test(line));
    if (startIdx < 0) return null;

    const titleLine = lines[startIdx] ?? '';
    const title = titleLine.replace(/^###\s+REQ-\d+\s*/, '').trim();

    let endIdx = lines.findIndex((line, i) => i > startIdx && /^#{2,3}\s+/.test(line));
    if (endIdx < 0) endIdx = lines.length;

    return {
      title,
      content: lines.slice(startIdx, endIdx).join('\n').trim(),
      lineNumber: startIdx + 1
    };
  }

  if (refId.startsWith('AC-')) {
    const pattern = new RegExp(`^-\\s+\\*\\*${refId}\\*\\*`);
    const lineIdx = lines.findIndex((line) => pattern.test(line));
    if (lineIdx < 0) return null;

    let endIdx = lineIdx + 1;
    while (endIdx < lines.length) {
      const line = lines[endIdx] ?? '';
      if (/^-\s+\*\*AC-\d+\*\*/.test(line)) break;
      if (/^#{1,3}\s+/.test(line)) break;
      if (line.trim() === '' && endIdx + 1 < lines.length) {
        const nextLine = lines[endIdx + 1] ?? '';
        if (nextLine.trim() && !nextLine.startsWith('  ') && !nextLine.startsWith('\t')) {
          break;
        }
      }
      endIdx++;
    }

    const content = lines.slice(lineIdx, endIdx).join('\n').trim();

    return {
      title: refId,
      content,
      lineNumber: lineIdx + 1
    };
  }

  return null;
}

/**
 * 加载关联文档内容
 * 从当前任务文件同目录的 01-需求.md 中提取关联的 REQ/AC 内容
 */
export async function loadLinkedDocs(taskFilePath: string, linkedRefs: string[]): Promise<LinkedDocVM[]> {
  if (!linkedRefs.length) return [];

  const api = window.specwave;
  if (!api) return [];

  const dirPath = taskFilePath.replace(/[/\\][^/\\]+$/, '');
  const reqFilePath = `${dirPath}/01-需求.md`;

  const res = await api.readTextFile(reqFilePath);
  if (!res.ok) return [];

  const docs: LinkedDocVM[] = [];

  for (const refId of linkedRefs) {
    const section = extractDocSection(res.text, refId);
    if (!section) continue;

    docs.push({
      refId,
      type: refId.startsWith('REQ-') ? 'req' : 'ac',
      title: section.title,
      content: section.content,
      sourceFile: '01-需求.md',
      lineNumber: section.lineNumber
    });
  }

  return docs;
}

