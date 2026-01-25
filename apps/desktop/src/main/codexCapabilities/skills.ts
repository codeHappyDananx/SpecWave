import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import type { CodexSkillVM, HealthState } from '@specwave/contracts';

import AdmZip from 'adm-zip';

import { toErrorMessage } from './sanitize';

export type SkillInstallResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: 'invalid-input' | 'already-exists' | 'unsupported' | 'failed' };

type SkillFrontMatter = { name: string; description: string; ok: boolean };

export function sanitizeWindowsFileName(name: string) {
  return name.replaceAll(/[<>:"/\\|?*]/g, '-').trim();
}

export function parseSkillFrontMatter(text: string): SkillFrontMatter {
  const trimmed = text.replaceAll('\r\n', '\n');
  if (!trimmed.startsWith('---\n')) return { name: '', description: '', ok: false };
  const end = trimmed.indexOf('\n---', 4);
  if (end < 0) return { name: '', description: '', ok: false };
  const fm = trimmed.slice(4, end).split('\n');
  let name = '';
  let description = '';
  for (const line of fm) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k === 'name' && !name) name = v;
    if (k === 'description' && !description) description = v;
  }
  return { name, description, ok: Boolean(name) };
}

async function readSkillMd(skillMdPath: string) {
  const buf = await fs.readFile(skillMdPath);
  const text = buf.toString('utf8');
  return { text, fm: parseSkillFrontMatter(text) };
}

export async function scanSkills(args: {
  projectRoot: string | null;
}): Promise<{ ok: true; skills: CodexSkillVM[] } | { ok: false; error: string }> {
  try {
    const roots: Array<{ dir: string; location: CodexSkillVM['location'] }> = [];
    const userDir = path.join(os.homedir(), '.codex', 'skills');
    roots.push({ dir: userDir, location: 'user' });
    if (args.projectRoot) roots.push({ dir: path.join(args.projectRoot, '.codex', 'skills'), location: 'repo' });

    const out: CodexSkillVM[] = [];

    for (const root of roots) {
      if (!fsSync.existsSync(root.dir)) continue;
      const entries = await fs.readdir(root.dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const id = ent.name;
        const skillDir = path.join(root.dir, ent.name);
        const skillMd = path.join(skillDir, 'SKILL.md');

        const hasSkillMd = fsSync.existsSync(skillMd);
        let hasValidFrontMatter = false;
        let name = id;
        let description = '';
        let health: { state: HealthState; message?: string } = { state: 'unknown' };

        if (!hasSkillMd) {
          health = { state: 'error', message: '缺少 SKILL.md。' };
        } else {
          try {
            const { fm } = await readSkillMd(skillMd);
            hasValidFrontMatter = fm.ok;
            if (fm.name) name = fm.name;
            if (fm.description) description = fm.description;
            health = fm.ok ? { state: 'ok', message: '结构完整。' } : { state: 'error', message: 'SKILL.md 元数据不可解析。' };
          } catch (err) {
            health = { state: 'error', message: `读取 SKILL.md 失败：${toErrorMessage(err)}` };
          }
        }

        out.push({
          id,
          name,
          description,
          location: root.location,
          rootPath: skillDir,
          health,
          safeMeta: { hasSkillMd, hasValidFrontMatter }
        });
      }
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, skills: out };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

function ensureDir(p: string) {
  fsSync.mkdirSync(p, { recursive: true });
}

async function removeDirIfExists(p: string) {
  if (!fsSync.existsSync(p)) return;
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(src: string, dst: string) {
  ensureDir(dst);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else if (ent.isFile()) await fs.copyFile(s, d);
  }
}

async function installSkillFromDir(args: { srcDir: string; dstRoot: string; overwrite: boolean }): Promise<SkillInstallResult> {
  const skillMd = path.join(args.srcDir, 'SKILL.md');
  if (!fsSync.existsSync(skillMd)) return { ok: false, error: '目录内缺少 SKILL.md。', code: 'invalid-input' };
  const { fm } = await readSkillMd(skillMd);
  const id = sanitizeWindowsFileName(fm.name || path.basename(args.srcDir) || 'skill');
  if (!id) return { ok: false, error: '无法确定技能名称。', code: 'invalid-input' };
  const dstDir = path.join(args.dstRoot, id);
  if (fsSync.existsSync(dstDir) && !args.overwrite) return { ok: false, error: '已存在同名技能目录。', code: 'already-exists' };
  await removeDirIfExists(dstDir);
  try {
    await copyDir(args.srcDir, dstDir);
    return { ok: true, message: '技能已安装。' };
  } catch (err) {
    await removeDirIfExists(dstDir);
    return { ok: false, error: toErrorMessage(err), code: 'failed' };
  }
}

async function installSkillFromMd(args: { mdPath: string; dstRoot: string; overwrite: boolean }): Promise<SkillInstallResult> {
  const base = path.basename(args.mdPath);
  if (base.toLowerCase() === 'skill.md') {
    return await installSkillFromDir({
      srcDir: path.dirname(args.mdPath),
      dstRoot: args.dstRoot,
      overwrite: args.overwrite
    });
  }

  const buf = await fs.readFile(args.mdPath);
  const text = buf.toString('utf8');
  const fm = parseSkillFrontMatter(text);
  const id = sanitizeWindowsFileName(fm.name || path.basename(args.mdPath, path.extname(args.mdPath)) || 'skill');
  if (!id) return { ok: false, error: '无法确定技能名称。', code: 'invalid-input' };
  const dstDir = path.join(args.dstRoot, id);
  if (fsSync.existsSync(dstDir) && !args.overwrite) return { ok: false, error: '已存在同名技能目录。', code: 'already-exists' };
  await removeDirIfExists(dstDir);
  try {
    ensureDir(dstDir);
    await fs.writeFile(path.join(dstDir, 'SKILL.md'), text, 'utf8');
    return { ok: true, message: '技能已安装。' };
  } catch (err) {
    await removeDirIfExists(dstDir);
    return { ok: false, error: toErrorMessage(err), code: 'failed' };
  }
}

async function detectSkillDirInZip(extractRoot: string) {
  const skillMdAtRoot = path.join(extractRoot, 'SKILL.md');
  if (fsSync.existsSync(skillMdAtRoot)) return extractRoot;

  const entries = await fs.readdir(extractRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(extractRoot, e.name));
  if (dirs.length === 1) {
    const only = dirs[0]!;
    if (fsSync.existsSync(path.join(only, 'SKILL.md'))) return only;
  }

  for (const d of dirs) {
    if (fsSync.existsSync(path.join(d, 'SKILL.md'))) return d;
  }
  return null;
}

async function installSkillFromZip(args: { zipPath: string; dstRoot: string; overwrite: boolean }): Promise<SkillInstallResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'specwave-skill-'));
  try {
    const zip = new AdmZip(args.zipPath);
    zip.extractAllTo(tmp, true);
    const dir = await detectSkillDirInZip(tmp);
    if (!dir) return { ok: false, error: 'zip 中未找到包含 SKILL.md 的技能目录。', code: 'invalid-input' };
    return await installSkillFromDir({ srcDir: dir, dstRoot: args.dstRoot, overwrite: args.overwrite });
  } catch (err) {
    return { ok: false, error: toErrorMessage(err), code: 'failed' };
  } finally {
    await removeDirIfExists(tmp);
  }
}

export async function installSkill(args: {
  source: { kind: 'zip' | 'md' | 'dir'; path: string };
  targetScope: 'user' | 'project';
  projectRoot: string | null;
  overwrite: boolean;
}): Promise<SkillInstallResult> {
  try {
    const dstRoot =
      args.targetScope === 'project'
        ? args.projectRoot
          ? path.join(args.projectRoot, '.codex', 'skills')
          : null
        : path.join(os.homedir(), '.codex', 'skills');

    if (!dstRoot) return { ok: false, error: '未找到项目根目录，无法安装到项目级。', code: 'invalid-input' };
    ensureDir(dstRoot);

    if (args.source.kind === 'dir') return await installSkillFromDir({ srcDir: args.source.path, dstRoot, overwrite: args.overwrite });
    if (args.source.kind === 'md') return await installSkillFromMd({ mdPath: args.source.path, dstRoot, overwrite: args.overwrite });
    if (args.source.kind === 'zip') return await installSkillFromZip({ zipPath: args.source.path, dstRoot, overwrite: args.overwrite });

    return { ok: false, error: '不支持的安装类型。', code: 'unsupported' };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err), code: 'failed' };
  }
}
