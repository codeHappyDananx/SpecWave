import { dialog, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getRecentProjects, removeRecentProject, touchRecentProject } from './recentProjects';

type DirEntryDTO = {
  name: string;
  path: string;
  kind: 'dir' | 'file';
};

type ReadDirectoryResult = { ok: true; entries: DirEntryDTO[] } | { ok: false; error: string };
type ReadTextFileResult = { ok: true; text: string; sha256: string } | { ok: false; error: string };
type SaveTextFileResult =
  | { ok: true; sha256: string }
  | { ok: false; error: string }
  | { ok: false; conflict: true; error: string };

function sha256(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

async function readDirectoryEntries(dirPath: string): Promise<DirEntryDTO[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries: DirEntryDTO[] = dirents
    .filter((d) => d.name !== '.' && d.name !== '..')
    .slice(0, 500)
    .map((d) => ({
      name: d.name,
      path: path.join(dirPath, d.name),
      kind: d.isDirectory() ? 'dir' : 'file'
    }));

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  return entries;
}

export function registerIpcHandlers() {
  ipcMain.handle('specwave:getRecentProjects', async () => {
    return getRecentProjects();
  });

  ipcMain.handle('specwave:touchRecentProject', async (_evt, args: { path: string }) => {
    return touchRecentProject(args.path);
  });

  ipcMain.handle('specwave:removeRecentProject', async (_evt, args: { path: string }) => {
    return removeRecentProject(args.path);
  });

  ipcMain.handle('specwave:selectDirectory', async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: '选择项目目录',
        properties: ['openDirectory']
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('specwave:readDirectory', async (_evt, args: { dirPath: string }): Promise<ReadDirectoryResult> => {
    try {
      const entries = await readDirectoryEntries(args.dirPath);
      return { ok: true, entries };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  ipcMain.handle('specwave:readTextFile', async (_evt, args: { filePath: string }): Promise<ReadTextFileResult> => {
    try {
      const buf = await fs.readFile(args.filePath);
      return { ok: true, text: buf.toString('utf8'), sha256: sha256(buf) };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  ipcMain.handle(
    'specwave:saveTextFile',
    async (_evt, args: { filePath: string; text: string; ifMatchSha256?: string }): Promise<SaveTextFileResult> => {
      try {
        if (args.ifMatchSha256) {
          const current = await fs.readFile(args.filePath);
          const currentHash = sha256(current);
          if (currentHash !== args.ifMatchSha256) {
            return { ok: false, conflict: true, error: '文件已被外部修改，已拒绝写入（指纹不一致）。' };
          }
        }

        const nextBuf = Buffer.from(args.text, 'utf8');
        await fs.writeFile(args.filePath, nextBuf);
        return { ok: true, sha256: sha256(nextBuf) };
      } catch (err) {
        return { ok: false, error: toErrorMessage(err) };
      }
    }
  );
}
