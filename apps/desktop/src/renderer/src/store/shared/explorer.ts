import type { ExplorerNodeVM } from '@specwave/contracts';

const defaultIgnoredNames = new Set(['node_modules', '.git', 'dist', 'out']);

export function isIgnoredEntryName(name: string): boolean {
  if (defaultIgnoredNames.has(name)) return true;
  if (name.startsWith('.tmp-') || name.startsWith('tmp-') || name.startsWith('tmp_')) return true;
  return false;
}

export function toExplorerNodes(entries: { name: string; path: string; kind: 'dir' | 'file' }[]): ExplorerNodeVM[] {
  return entries.map((e) => ({ id: e.path, name: e.name, kind: e.kind, isIgnored: isIgnoredEntryName(e.name) }));
}

