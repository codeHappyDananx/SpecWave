export function detectSep(p: string) {
  return p.includes('/') ? '/' : '\\';
}

export function joinPath(base: string, ...rest: string[]) {
  const sep = detectSep(base);
  const parts = [base, ...rest].filter(Boolean).map((s) => s.replace(/[\\/]+$/g, '').replace(/^[\\/]+/g, ''));
  if (parts.length === 0) return '';
  const [first, ...tail] = parts;
  return [first, ...tail].join(sep);
}

export function basename(p: string) {
  const sep = detectSep(p);
  const normalized = p.replace(/[\\/]+$/g, '');
  const idx = normalized.lastIndexOf(sep);
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function extname(p: string) {
  const b = basename(p);
  const idx = b.lastIndexOf('.');
  if (idx <= 0) return '';
  return b.slice(idx).toLowerCase();
}

export function dirname(p: string) {
  const sep = detectSep(p);
  const normalized = p.replace(/[\\/]+$/g, '');
  const idx = normalized.lastIndexOf(sep);
  if (idx < 0) return normalized;
  if (idx === 0) return sep;
  return normalized.slice(0, idx);
}

export function normalizeFsPath(p: string) {
  return p.replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase();
}
