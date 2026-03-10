import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assistantApprove,
  assistantChat,
  assistantGetEvidence,
  assistantGetProfile,
  assistantListCapabilityPacks,
  assistantOnboardingContinue,
  assistantOnboardingFinish,
  assistantOnboardingStart,
  assistantUpdateProfile
} from './assistantApi';
import { getRecentProjects, removeRecentProject, touchRecentProject } from './recentProjects';
import { codexCapabilitiesProbe, codexMcpInstallFromJson, codexMcpProbe, codexSkillInstall, codexSkillsProbe } from './codexCapabilities';

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
type ClipboardWriteTextResult = { ok: true } | { ok: false; error: string };
type ClipboardReadTextResult = { ok: true; text: string } | { ok: false; error: string };

type SpecWaveInitStepKey = 'check' | 'generatePlan' | 'writeFiles' | 'verify';
type SpecWaveInitStepStatus = 'todo' | 'doing' | 'done' | 'error';
type SpecWaveInitStartArgs = { projectRoot: string };
type SpecWaveInitStartResult = { ok: true } | { ok: false; error: string };

type SpecWaveInitEventDTO =
  | {
      type: 'progress';
      payload: {
        step?: { key: SpecWaveInitStepKey; title?: string; status: SpecWaveInitStepStatus };
        progress?: { percent: number; label?: string };
        logAppend?: { level: 'info' | 'warn' | 'error'; text: string; time?: string };
      };
    }
  | {
      type: 'result';
      payload:
        | { ok: true }
        | { ok: false; error: { title: string; detail?: string; canRetry: boolean; copyText?: string } };
    };

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

const initRunningByWebContentsId = new Set<number>();

function nowTimeText() {
  try {
    return new Date().toLocaleTimeString();
  } catch {
    return undefined;
  }
}

function sendInitEvent(webContents: Electron.WebContents, evt: SpecWaveInitEventDTO) {
  try {
    webContents.send('specwave:init:event', evt);
  } catch {}
}

function resolvePackLightRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'specwave-skills', 'resources', 'packs', 'core', 'light'),
    path.resolve(process.cwd(), '..', 'specwave-skills', 'resources', 'packs', 'core', 'light'),
    path.resolve(process.cwd(), '..', '..', 'specwave-skills', 'resources', 'packs', 'core', 'light'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'specwave-skills', 'resources', 'packs', 'core', 'light')
  ];
  for (const base of candidates) {
    const settingsPath = path.join(base, '.specwave', 'settings.json');
    if (fsSync.existsSync(settingsPath)) return base;
  }
  return null;
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) await walk(abs);
      else out.push(abs);
    }
  };
  await walk(rootDir);
  return out;
}

function mergeJsonMissing(target: unknown, source: unknown): unknown {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return target;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  const t = target as Record<string, unknown>;
  const s = source as Record<string, unknown>;
  for (const k of Object.keys(s)) {
    if (!(k in t)) {
      t[k] = s[k];
      continue;
    }
    t[k] = mergeJsonMissing(t[k], s[k]);
  }
  return t;
}

async function runProjectInit(args: { webContents: Electron.WebContents; projectRoot: string }) {
  const { webContents, projectRoot } = args;

  const setStep = (key: SpecWaveInitStepKey, status: SpecWaveInitStepStatus, title?: string) =>
    sendInitEvent(webContents, { type: 'progress', payload: { step: { key, status, title } } });
  const setProgress = (percent: number, label?: string) =>
    sendInitEvent(webContents, { type: 'progress', payload: { progress: { percent, label } } });
  const log = (level: 'info' | 'warn' | 'error', text: string) =>
    sendInitEvent(webContents, { type: 'progress', payload: { logAppend: { level, text, time: nowTimeText() } } });

  try {
    setStep('check', 'doing', '检查环境');
    const st = await fs.stat(projectRoot);
    if (!st.isDirectory()) throw new Error('项目根不是目录。');
    const packRoot = resolvePackLightRoot();
    if (!packRoot) throw new Error('未找到初始化资源包（core/light）。');
    const packSpecwaveDir = path.join(packRoot, '.specwave');
    const packAgentsTemplate = path.join(packRoot, 'project-root', 'AGENTS.md.template');
    setStep('check', 'done', '检查环境');

    setStep('generatePlan', 'doing', '生成初始化计划');
    const packFiles = await listFilesRecursive(packSpecwaveDir);
    const willWriteCount = packFiles.length + (fsSync.existsSync(packAgentsTemplate) ? 1 : 0) + 1;
    log('info', `目标目录：${projectRoot}`);
    log('info', `资源包：${packRoot}`);
    log('info', `计划：将写入/刷新 ${willWriteCount} 项（含 .specwave 与工作区目录）`);
    setStep('generatePlan', 'done', '生成初始化计划');

    setStep('writeFiles', 'doing', '写入文件');
    setProgress(0, '准备写入…');

    const targetSpecwaveDir = path.join(projectRoot, '.specwave');
    const targetWorkspaceDir = path.join(targetSpecwaveDir, 'workspace');

    const stepsTotal = packFiles.length + 6;
    let done = 0;
    const bump = (label: string) => {
      done += 1;
      setProgress(Math.round((done / stepsTotal) * 100), label);
    };

    await fs.mkdir(targetSpecwaveDir, { recursive: true });
    bump('创建 .specwave/…');

    for (const srcAbs of packFiles) {
      const rel = path.relative(packSpecwaveDir, srcAbs);
      const dstAbs = path.join(targetSpecwaveDir, rel);
      const dstDir = path.dirname(dstAbs);
      await fs.mkdir(dstDir, { recursive: true });

      if (rel === 'settings.json') {
        const srcText = await fs.readFile(srcAbs, 'utf8');
        const srcJson = JSON.parse(srcText) as unknown;
        let merged: unknown = srcJson;
        if (fsSync.existsSync(dstAbs)) {
          try {
            const dstText = await fs.readFile(dstAbs, 'utf8');
            const dstJson = JSON.parse(dstText) as unknown;
            merged = mergeJsonMissing(dstJson, srcJson);
            log('info', '合并 .specwave/settings.json（保留自定义与 currentSession）。');
          } catch (err) {
            log('warn', `读取既有 settings.json 失败，改为覆盖缺失字段：${toErrorMessage(err)}`);
          }
        } else {
          log('info', '写入 .specwave/settings.json。');
        }
        await fs.writeFile(dstAbs, JSON.stringify(merged, null, 2), 'utf8');
        bump(`写入 ${rel}`);
        continue;
      }

      if (fsSync.existsSync(dstAbs)) {
        bump(`跳过已存在：${rel}`);
        continue;
      }

      await fs.copyFile(srcAbs, dstAbs);
      bump(`写入 ${rel}`);
    }

    if (fsSync.existsSync(packAgentsTemplate)) {
      const agentsTarget = path.join(projectRoot, 'AGENTS.md');
      if (!fsSync.existsSync(agentsTarget)) {
        await fs.copyFile(packAgentsTemplate, agentsTarget);
        log('info', '创建 AGENTS.md。');
      } else {
        log('info', '已存在 AGENTS.md，跳过写入。');
      }
      bump('处理 AGENTS.md');
    }

    await fs.mkdir(path.join(targetWorkspaceDir, 'stories'), { recursive: true });
    await fs.mkdir(path.join(targetWorkspaceDir, 'stories', 'archive'), { recursive: true });
    await fs.mkdir(path.join(targetWorkspaceDir, 'bugs'), { recursive: true });
    await fs.mkdir(path.join(targetWorkspaceDir, 'bugs', 'archive'), { recursive: true });
    await fs.mkdir(path.join(targetWorkspaceDir, 'specs'), { recursive: true });
    bump('创建 .specwave/workspace/…');

    const projectMapPath = path.join(targetWorkspaceDir, 'project-map.md');
    if (!fsSync.existsSync(projectMapPath)) {
      const text = [
        '# Project Map（项目路径图）',
        '',
        '> 这是本项目的“结构真相源”：只记录结论（结构/职责/边界），不写过程复盘。',
        '',
        '## 0. 初始化成果',
        '- 初始化来源：桌面端初始化引导',
        '',
        '## 1. 入口与运行方式',
        '- [待补充]',
        '',
        '## 2. 路径树',
        '```text',
        '.',
        '```',
        '',
        '## 3. 关键目录/文件职责',
        '| 路径 | 职责（简述） | 依赖谁 | 被谁依赖 | 边界/备注 |',
        '| --- | --- | --- | --- | --- |',
        ''
      ].join('\n');
      await fs.writeFile(projectMapPath, text, 'utf8');
      log('info', '创建 .specwave/workspace/project-map.md。');
    }
    bump('写入 project-map.md');

    setStep('writeFiles', 'done', '写入文件');

    setStep('verify', 'doing', '校验结果');
    if (!fsSync.existsSync(targetWorkspaceDir)) throw new Error('未生成 .specwave/workspace。');
    if (!fsSync.existsSync(path.join(targetSpecwaveDir, 'settings.json'))) throw new Error('未生成 .specwave/settings.json。');
    setStep('verify', 'done', '校验结果');
    setProgress(100, '完成');

    sendInitEvent(webContents, { type: 'result', payload: { ok: true } });
  } catch (err) {
    sendInitEvent(webContents, {
      type: 'result',
      payload: {
        ok: false,
        error: { title: '初始化失败', detail: toErrorMessage(err), canRetry: true, copyText: toErrorMessage(err) }
      }
    });
  }
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

  ipcMain.handle('specwave:selectDirectory', async (_evt, args?: { title?: string }) => {
    try {
      const res = await dialog.showOpenDialog({
        title: args?.title ?? '选择项目目录',
        properties: ['openDirectory']
      });
      if (res.canceled || res.filePaths.length === 0) return null;
      return res.filePaths[0];
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle(
    'specwave:selectFile',
    async (_evt, args: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
      try {
        const res = await dialog.showOpenDialog({
          title: args?.title ?? '选择文件',
          properties: ['openFile'],
          filters: Array.isArray(args?.filters) ? args.filters : undefined
        });
        if (res.canceled || res.filePaths.length === 0) return null;
        return res.filePaths[0];
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'specwave:codex:probe',
    async (_evt, args: { includeConnectivityProbe: boolean; projectRoot: string | null }) => {
      return await codexCapabilitiesProbe({
        includeConnectivityProbe: Boolean(args?.includeConnectivityProbe),
        projectRoot: args?.projectRoot ?? null
      });
    }
  );

  ipcMain.handle(
    'specwave:codex:mcpProbe',
    async (_evt, args: { includeConnectivityProbe: boolean; projectRoot: string | null }) => {
      return await codexMcpProbe({
        includeConnectivityProbe: Boolean(args?.includeConnectivityProbe),
        projectRoot: args?.projectRoot ?? null
      });
    }
  );

  ipcMain.handle('specwave:codex:skillsProbe', async (_evt, args: { projectRoot: string | null }) => {
    return await codexSkillsProbe({ projectRoot: args?.projectRoot ?? null });
  });

  ipcMain.handle('specwave:codex:mcpInstallFromJson', async (_evt, args: { rawJson: string; overwrite: boolean }) => {
    return await codexMcpInstallFromJson({ rawJson: args?.rawJson ?? '', overwrite: Boolean(args?.overwrite) });
  });

  ipcMain.handle(
    'specwave:codex:skillInstall',
    async (
      _evt,
      args: {
        source: { kind: 'zip' | 'md' | 'dir'; path: string };
        targetScope: 'user' | 'project';
        projectRoot: string | null;
        overwrite: boolean;
      }
    ) => {
      return await codexSkillInstall({
        source: args?.source ?? { kind: 'md', path: '' },
        targetScope: args?.targetScope ?? 'user',
        projectRoot: args?.projectRoot ?? null,
        overwrite: Boolean(args?.overwrite)
      });
    }
  );

  ipcMain.handle('specwave:assistant:getProfile', async () => {
    return await assistantGetProfile();
  });

  ipcMain.handle('specwave:assistant:updateProfile', async (_evt, args: { patch: Record<string, unknown> }) => {
    return await assistantUpdateProfile((args?.patch ?? {}) as never);
  });

  ipcMain.handle('specwave:assistant:listCapabilityPacks', async () => {
    return await assistantListCapabilityPacks();
  });

  ipcMain.handle('specwave:assistant:onboardingStart', async () => {
    return await assistantOnboardingStart();
  });

  ipcMain.handle('specwave:assistant:onboardingContinue', async (_evt, args: { message: string }) => {
    return await assistantOnboardingContinue(args?.message ?? '');
  });

  ipcMain.handle('specwave:assistant:onboardingFinish', async (_evt, args: { confirmed: boolean; note?: string }) => {
    return await assistantOnboardingFinish({
      confirmed: Boolean(args?.confirmed),
      note: args?.note
    });
  });

  ipcMain.handle(
    'specwave:assistant:chat',
    async (_evt, args: { sessionId?: string; message: string; channel?: string; tenantId?: string; projectId?: string }) => {
      return await assistantChat({
        sessionId: args?.sessionId,
        message: args?.message ?? '',
        channel: args?.channel,
        tenantId: args?.tenantId,
        projectId: args?.projectId
      });
    }
  );

  ipcMain.handle(
    'specwave:assistant:approve',
    async (_evt, args: { sessionId: string; action: 'approve' | 'reject'; comment?: string }) => {
      return await assistantApprove(args?.sessionId ?? '', {
        action: args?.action ?? 'approve',
        comment: args?.comment
      });
    }
  );

  ipcMain.handle('specwave:assistant:getEvidence', async (_evt, args: { sessionId: string }) => {
    return await assistantGetEvidence(args?.sessionId ?? '');
  });

  /**
   * SpecWave 初始化引导（左栏）
   *
   * - 通道：specwave:initStart
   * - 入参：projectRoot（项目根目录）
   * - 出参：仅返回“是否已启动”；进度与结果通过 specwave:init:event 推送
   * - 失败语义：启动失败（并发/参数错误）直接返回；执行中失败通过 result 事件返回，可重试
   */
  ipcMain.handle('specwave:initStart', async (evt, args: SpecWaveInitStartArgs): Promise<SpecWaveInitStartResult> => {
    const webContents = evt.sender;
    if (!args?.projectRoot) return { ok: false, error: '未提供项目根目录。' };
    if (initRunningByWebContentsId.has(webContents.id)) return { ok: false, error: '初始化正在进行。' };
    initRunningByWebContentsId.add(webContents.id);
    void runProjectInit({ webContents, projectRoot: args.projectRoot }).finally(() => {
      initRunningByWebContentsId.delete(webContents.id);
    });
    return { ok: true };
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

  ipcMain.on('specwave:clipboardWriteTextSync', (evt, args: { text: string }): ClipboardWriteTextResult => {
    const text = typeof args?.text === 'string' ? args.text : '';
    try {
      clipboard.writeText(text);
      evt.returnValue = { ok: true };
    } catch (err) {
      evt.returnValue = { ok: false, error: toErrorMessage(err) };
    }
    return evt.returnValue;
  });

  ipcMain.on('specwave:clipboardReadTextSync', (evt): ClipboardReadTextResult => {
    try {
      evt.returnValue = { ok: true, text: clipboard.readText() };
    } catch (err) {
      evt.returnValue = { ok: false, error: toErrorMessage(err) };
    }
    return evt.returnValue;
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
