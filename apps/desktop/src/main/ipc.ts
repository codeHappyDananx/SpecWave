import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
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
type ReadBinaryFileResult =
  | { ok: true; base64: string; mime: string; sha256: string; size: number }
  | { ok: false; error: string };
type SaveTextFileResult =
  | { ok: true; sha256: string }
  | { ok: false; error: string }
  | { ok: false; conflict: true; error: string };

type MessageBoxOptions = {
  title?: string;
  message: string;
  detail?: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
};
type MessageBoxResult = { ok: true; response: number } | { ok: false; error: string };

type FsEventDTO = { event: 'rename' | 'change'; path: string };
type FsWatchStartArgs = { workspaceRoot?: string | null; projectRoot?: string | null };
type FsWatchStartResult = { ok: true } | { ok: false; error: string };
type RevealInFolderResult = { ok: true } | { ok: false; error: string };

export type AppShellBridge = {
  openMainWindow: (args: { projectPath?: string | null }) => Promise<void> | void;
  openWelcomeWindow: (args: { fromWindowId?: number | null }) => Promise<void> | void;
  quitApp: () => void;
};

const MAX_BINARY_BYTES = 20 * 1024 * 1024;

function sha256(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

function mimeFromFilePath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

type FsWatchGroup = {
  roots: { workspaceRoot: string | null; projectRoot: string | null };
  watchers: fsSync.FSWatcher[];
};

const fsWatchGroupsByWebContentsId = new Map<number, FsWatchGroup>();

function stopFsWatchGroup(webContentsId: number) {
  const group = fsWatchGroupsByWebContentsId.get(webContentsId);
  if (!group) return;
  fsWatchGroupsByWebContentsId.delete(webContentsId);
  for (const w of group.watchers) {
    try {
      w.close();
    } catch {}
  }
}

function startFsWatchGroup(webContents: Electron.WebContents, args: FsWatchStartArgs) {
  const id = webContents.id;
  const nextRoots = {
    workspaceRoot: typeof args.workspaceRoot === 'string' && args.workspaceRoot.trim().length ? args.workspaceRoot : null,
    projectRoot: typeof args.projectRoot === 'string' && args.projectRoot.trim().length ? args.projectRoot : null
  };

  const prev = fsWatchGroupsByWebContentsId.get(id);
  if (
    prev &&
    prev.roots.workspaceRoot === nextRoots.workspaceRoot &&
    prev.roots.projectRoot === nextRoots.projectRoot
  ) {
    return;
  }

  if (!prev) {
    webContents.once('destroyed', () => stopFsWatchGroup(id));
  }

  stopFsWatchGroup(id);

  const watchers: fsSync.FSWatcher[] = [];
  const watchRoot = (root: string) => {
    try {
      if (!fsSync.existsSync(root)) return;
      const st = fsSync.statSync(root);
      if (!st.isDirectory()) return;
    } catch {
      return;
    }

    const attach = (recursive: boolean) => {
      const w = fsSync.watch(
        root,
        { recursive },
        (event, filename) => {
          const safeEvent = event === 'rename' || event === 'change' ? event : 'change';
          const name = filename == null ? '' : String(filename);
          const fullPath = name.length ? path.join(root, name) : root;
          try {
            webContents.send('specwave:fs:event', { event: safeEvent, path: fullPath } satisfies FsEventDTO);
          } catch {}
        }
      );
      watchers.push(w);
    };

    try {
      attach(true);
    } catch {
      attach(false);
    }
  };

  if (nextRoots.workspaceRoot) watchRoot(nextRoots.workspaceRoot);
  if (nextRoots.projectRoot) watchRoot(nextRoots.projectRoot);

  fsWatchGroupsByWebContentsId.set(id, { roots: nextRoots, watchers });
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

export function registerIpcHandlers(appShell: AppShellBridge) {
  ipcMain.handle('specwave:openMainWindow', async (_evt, args: { projectPath?: string | null }) => {
    await appShell.openMainWindow({ projectPath: args?.projectPath ?? null });
  });

  ipcMain.handle('specwave:openWelcomeWindow', async (evt) => {
    const fromWin = BrowserWindow.fromWebContents(evt.sender);
    await appShell.openWelcomeWindow({ fromWindowId: fromWin?.id ?? null });
  });

  ipcMain.handle('specwave:quitApp', async () => {
    appShell.quitApp();
  });

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

  ipcMain.handle('specwave:readBinaryFile', async (_evt, args: { filePath: string }): Promise<ReadBinaryFileResult> => {
    try {
      const stat = await fs.stat(args.filePath);
      if (!stat.isFile()) return { ok: false, error: '不是文件。' };
      if (stat.size > MAX_BINARY_BYTES) {
        return { ok: false, error: `文件过大（${stat.size} bytes），已拒绝加载。` };
      }

      const buf = await fs.readFile(args.filePath);
      const mime = mimeFromFilePath(args.filePath);
      return { ok: true, base64: buf.toString('base64'), mime, sha256: sha256(buf), size: buf.byteLength };
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

  ipcMain.handle('specwave:showMessageBox', async (evt, args: MessageBoxOptions): Promise<MessageBoxResult> => {
    try {
      const win = BrowserWindow.fromWebContents(evt.sender);
      if (!win) return { ok: false, error: '窗口已关闭。' };
      const res = await dialog.showMessageBox(win, {
        type: 'question',
        title: args.title || 'SpecWave',
        message: args.message,
        detail: args.detail,
        buttons: Array.isArray(args.buttons) && args.buttons.length ? args.buttons : ['确定'],
        defaultId: typeof args.defaultId === 'number' ? args.defaultId : 0,
        cancelId: typeof args.cancelId === 'number' ? args.cancelId : undefined,
        noLink: true
      });
      return { ok: true, response: res.response };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  ipcMain.handle('specwave:revealInFolder', async (_evt, args: { path: string }): Promise<RevealInFolderResult> => {
    const target = typeof args?.path === 'string' ? args.path : '';
    if (!target.trim()) return { ok: false, error: '路径为空。' };
    try {
      if (!fsSync.existsSync(target)) return { ok: false, error: '路径不存在。' };
      const st = fsSync.statSync(target);
      if (st.isDirectory()) {
        const err = await shell.openPath(target);
        if (err) return { ok: false, error: err };
        return { ok: true };
      }

      shell.showItemInFolder(target);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });

  ipcMain.handle('specwave:fsWatchStart', async (evt, args: FsWatchStartArgs): Promise<FsWatchStartResult> => {
    try {
      startFsWatchGroup(evt.sender, args);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  });
}
