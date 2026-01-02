import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type RecentProjectRecord = {
  path: string;
  lastOpenedAt: number;
};

export type RecentProjectDTO = {
  path: string;
  name: string;
  lastOpenedAt: number;
  exists: boolean;
};

const MAX_RECENTS = 10;
const RECENTS_FILE_NAME = 'recent-projects.json';

function recentsFilePath() {
  return path.join(app.getPath('userData'), RECENTS_FILE_NAME);
}

function normalizeProjectPath(p: string) {
  return p.trim().replace(/[\\/]+$/g, '');
}

async function fileExists(p: string) {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function loadRecords(): Promise<RecentProjectRecord[]> {
  try {
    const buf = await fs.readFile(recentsFilePath());
    const raw = JSON.parse(buf.toString('utf8')) as unknown;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((x) => {
        const obj = x as Partial<RecentProjectRecord>;
        if (typeof obj.path !== 'string') return null;
        const lastOpenedAt = typeof obj.lastOpenedAt === 'number' ? obj.lastOpenedAt : Date.now();
        return { path: normalizeProjectPath(obj.path), lastOpenedAt };
      })
      .filter(Boolean)
      .slice(0, 200) as RecentProjectRecord[];
  } catch {
    return [];
  }
}

async function saveRecords(records: RecentProjectRecord[]) {
  const deduped = new Map<string, RecentProjectRecord>();
  for (const r of records) {
    if (!r.path) continue;
    const p = normalizeProjectPath(r.path);
    const prev = deduped.get(p);
    if (!prev || prev.lastOpenedAt < r.lastOpenedAt) deduped.set(p, { path: p, lastOpenedAt: r.lastOpenedAt });
  }

  const next = [...deduped.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, MAX_RECENTS);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(recentsFilePath(), Buffer.from(JSON.stringify(next, null, 2), 'utf8'));
}

export async function getRecentProjects(): Promise<RecentProjectDTO[]> {
  const records = await loadRecords();
  const sorted = records.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, MAX_RECENTS);
  const dtos: RecentProjectDTO[] = [];
  for (const r of sorted) {
    const exists = await fileExists(r.path);
    dtos.push({
      path: r.path,
      name: path.basename(r.path) || r.path,
      lastOpenedAt: r.lastOpenedAt,
      exists
    });
  }
  return dtos;
}

export async function touchRecentProject(projectPath: string): Promise<RecentProjectDTO[]> {
  const p = normalizeProjectPath(projectPath);
  if (!p) return getRecentProjects();
  const records = await loadRecords();
  await saveRecords([{ path: p, lastOpenedAt: Date.now() }, ...records]);
  return getRecentProjects();
}

export async function removeRecentProject(projectPath: string): Promise<RecentProjectDTO[]> {
  const p = normalizeProjectPath(projectPath);
  const records = await loadRecords();
  await saveRecords(records.filter((r) => normalizeProjectPath(r.path) !== p));
  return getRecentProjects();
}

