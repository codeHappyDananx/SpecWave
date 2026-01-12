export function findMatchStarts(text: string, query: string) {
  const q = query.trim();
  if (!q) return [];
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const hits: number[] = [];
  let idx = 0;
  while (idx <= lowerText.length - lowerQuery.length) {
    const next = lowerText.indexOf(lowerQuery, idx);
    if (next < 0) break;
    hits.push(next);
    idx = next + Math.max(1, lowerQuery.length);
  }
  return hits;
}
