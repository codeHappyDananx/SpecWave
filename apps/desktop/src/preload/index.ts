import { clipboard, contextBridge, ipcRenderer } from 'electron';
import type { CodexMcpServerVM, CodexSkillVM } from '@specwave/contracts';

export type DirEntryDTO = {
  name: string;
  path: string;
  kind: 'dir' | 'file';
};

export type ReadDirectoryResult = { ok: true; entries: DirEntryDTO[] } | { ok: false; error: string };
export type ReadTextFileResult = { ok: true; text: string; sha256: string } | { ok: false; error: string };
export type ReadBinaryFileResult =
  | { ok: true; base64: string; mime: string; sha256: string; size: number }
  | { ok: false; error: string };
export type SaveTextFileResult =
  | { ok: true; sha256: string }
  | { ok: false; error: string }
  | { ok: false; conflict: true; error: string };

export type MessageBoxOptions = {
  title?: string;
  message: string;
  detail?: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
};
export type MessageBoxResult = { ok: true; response: number } | { ok: false; error: string };

export type SelectFileArgs = { title?: string; filters?: Array<{ name: string; extensions: string[] }> };

export type FsEventDTO = { event: 'rename' | 'change'; path: string };
export type FsWatchStartResult = { ok: true } | { ok: false; error: string };
export type RevealInFolderResult = { ok: true } | { ok: false; error: string };

export type RecentProjectDTO = {
  path: string;
  name: string;
  lastOpenedAt: number;
  exists: boolean;
};

export type TerminalCreateResult = { ok: true } | { ok: false; error: string };
export type TerminalEventDTO =
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number; signal?: number | null }
  | { type: 'error'; id: string; error: string };

export type TerminalPasteImageOptions = {
  cwd?: string | null;
  prefix?: string;
};

export type TerminalPasteImageResult =
  | { ok: true; fileName: string; filePath: string }
  | {
      ok: false;
      error: string;
      code: 'clipboard-no-image' | 'clipboard-image-empty' | 'create-paste-dir-failed' | 'write-failed';
    };

export type SpecWaveInitStepKey = 'check' | 'generatePlan' | 'writeFiles' | 'verify';
export type SpecWaveInitStepStatus = 'todo' | 'doing' | 'done' | 'error';
export type SpecWaveInitStartResult = { ok: true } | { ok: false; error: string };
export type SpecWaveInitEventDTO =
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

export type CodexCapabilitiesProbeResult =
  | { ok: true; checkedAt: string; mcpServers: CodexMcpServerVM[]; skills: CodexSkillVM[] }
  | { ok: false; error: string };

export type CodexMcpInstallFromJsonResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: 'invalid-input' | 'already-exists' | 'unsupported' | 'failed' };

export type CodexSkillInstallResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: 'invalid-input' | 'already-exists' | 'unsupported' | 'failed' };

contextBridge.exposeInMainWorld('specwave', {
  ping: () => 'pong',
  openMainWindow: (projectPath?: string | null) =>
    ipcRenderer.invoke('specwave:openMainWindow', { projectPath }) as Promise<void>,
  openWelcomeWindow: () => ipcRenderer.invoke('specwave:openWelcomeWindow') as Promise<void>,
  quitApp: () => ipcRenderer.invoke('specwave:quitApp') as Promise<void>,
  getRecentProjects: () => ipcRenderer.invoke('specwave:getRecentProjects') as Promise<RecentProjectDTO[]>,
  touchRecentProject: (p: string) => ipcRenderer.invoke('specwave:touchRecentProject', { path: p }) as Promise<RecentProjectDTO[]>,
  removeRecentProject: (p: string) =>
    ipcRenderer.invoke('specwave:removeRecentProject', { path: p }) as Promise<RecentProjectDTO[]>,
  selectDirectory: (args?: { title?: string }) =>
    ipcRenderer.invoke('specwave:selectDirectory', args) as Promise<string | null>,
  selectFile: (args: SelectFileArgs) => ipcRenderer.invoke('specwave:selectFile', args) as Promise<string | null>,
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('specwave:readDirectory', { dirPath }) as Promise<ReadDirectoryResult>,
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke('specwave:readTextFile', { filePath }) as Promise<ReadTextFileResult>,
  readBinaryFile: (filePath: string) =>
    ipcRenderer.invoke('specwave:readBinaryFile', { filePath }) as Promise<ReadBinaryFileResult>,
  saveTextFile: (filePath: string, text: string, ifMatchSha256?: string) =>
    ipcRenderer.invoke('specwave:saveTextFile', { filePath, text, ifMatchSha256 }) as Promise<SaveTextFileResult>,

  specwaveInitStart: (args: { projectRoot: string }) =>
    ipcRenderer.invoke('specwave:initStart', args) as Promise<SpecWaveInitStartResult>,
  onSpecwaveInitEvent: (cb: (evt: SpecWaveInitEventDTO) => void) => {
    const listener = (_evt: unknown, payload: SpecWaveInitEventDTO) => cb(payload);
    ipcRenderer.on('specwave:init:event', listener);
    return () => {
      ipcRenderer.off('specwave:init:event', listener);
    };
  },

  showMessageBox: (options: MessageBoxOptions) =>
    ipcRenderer.invoke('specwave:showMessageBox', options) as Promise<MessageBoxResult>,

  codexCapabilitiesProbe: (args: { includeConnectivityProbe: boolean; projectRoot: string | null }) =>
    ipcRenderer.invoke('specwave:codex:probe', args) as Promise<CodexCapabilitiesProbeResult>,
  codexMcpInstallFromJson: (args: { rawJson: string; overwrite: boolean }) =>
    ipcRenderer.invoke('specwave:codex:mcpInstallFromJson', args) as Promise<CodexMcpInstallFromJsonResult>,
  codexSkillInstall: (args: {
    source: { kind: 'zip' | 'md' | 'dir'; path: string };
    targetScope: 'user' | 'project';
    projectRoot: string | null;
    overwrite: boolean;
  }) => ipcRenderer.invoke('specwave:codex:skillInstall', args) as Promise<CodexSkillInstallResult>,

  fsWatchStart: (args: { workspaceRoot?: string | null; projectRoot?: string | null }) =>
    ipcRenderer.invoke('specwave:fsWatchStart', args) as Promise<FsWatchStartResult>,
  onFsEvent: (cb: (evt: FsEventDTO) => void) => {
    const listener = (_evt: unknown, payload: FsEventDTO) => cb(payload);
    ipcRenderer.on('specwave:fs:event', listener);
    return () => {
      ipcRenderer.off('specwave:fs:event', listener);
    };
  },

  clipboardReadText: () => {
    try {
      const res = ipcRenderer.sendSync('specwave:clipboardReadTextSync') as
        | { ok: true; text: string }
        | { ok: false; error: string }
        | undefined;
      if (res?.ok) return typeof res.text === 'string' ? res.text : '';
    } catch {}
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  },
  clipboardReadFilePaths: () => {
    if (process.platform === 'win32') {
      try {
        const buffer = clipboard.readBuffer('FileNameW');
        if (!buffer || buffer.length === 0) return [];
        const raw = buffer.toString('ucs2');
        return raw.split('\0').filter(Boolean);
      } catch {
        return [];
      }
    }
    if (process.platform === 'darwin') {
      try {
        const raw = clipboard.read('public.file-url');
        if (!raw) return [];
        return raw
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => (item.startsWith('file://') ? item.slice('file://'.length) : item));
      } catch {
        return [];
      }
    }
    return [];
  },
  clipboardWriteText: (text: string) => {
    let ok = false;
    try {
      const res = ipcRenderer.sendSync('specwave:clipboardWriteTextSync', { text }) as { ok: boolean } | undefined;
      ok = Boolean(res?.ok);
    } catch {}
    if (ok) return;
    try {
      clipboard.writeText(text);
    } catch {}
  },

  revealInFolder: (p: string) =>
    ipcRenderer.invoke('specwave:revealInFolder', { path: p }) as Promise<RevealInFolderResult>,

  terminalCreateSession: (args: { id: string; cwd?: string | null; cols?: number | null; rows?: number | null }) =>
    ipcRenderer.invoke('specwave:terminal:create', args) as Promise<TerminalCreateResult>,
  terminalKillSession: (id: string) => ipcRenderer.invoke('specwave:terminal:kill', { id }) as Promise<void>,
  terminalWrite: (id: string, data: string) => ipcRenderer.send('specwave:terminal:write', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.send('specwave:terminal:resize', { id, cols, rows }),
  terminalPasteImage: (args: TerminalPasteImageOptions) =>
    ipcRenderer.invoke('specwave:terminal:pasteImage', args) as Promise<TerminalPasteImageResult>,
  onTerminalEvent: (cb: (evt: TerminalEventDTO) => void) => {
    const listener = (_evt: unknown, payload: TerminalEventDTO) => cb(payload);
    ipcRenderer.on('specwave:terminal:event', listener);
    return () => {
      ipcRenderer.off('specwave:terminal:event', listener);
    };
  }
});

declare global {
  interface Window {
    specwave: {
      ping: () => string;
      openMainWindow: (projectPath?: string | null) => Promise<void>;
      openWelcomeWindow: () => Promise<void>;
      quitApp: () => Promise<void>;
      getRecentProjects: () => Promise<RecentProjectDTO[]>;
      touchRecentProject: (path: string) => Promise<RecentProjectDTO[]>;
      removeRecentProject: (path: string) => Promise<RecentProjectDTO[]>;
      selectDirectory: (args?: { title?: string }) => Promise<string | null>;
      selectFile: (args: SelectFileArgs) => Promise<string | null>;
      readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
      readTextFile: (filePath: string) => Promise<ReadTextFileResult>;
      readBinaryFile: (filePath: string) => Promise<ReadBinaryFileResult>;
      saveTextFile: (filePath: string, text: string, ifMatchSha256?: string) => Promise<SaveTextFileResult>;

      specwaveInitStart: (args: { projectRoot: string }) => Promise<SpecWaveInitStartResult>;
      onSpecwaveInitEvent: (cb: (evt: SpecWaveInitEventDTO) => void) => () => void;

      showMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxResult>;

      codexCapabilitiesProbe: (args: { includeConnectivityProbe: boolean; projectRoot: string | null }) => Promise<CodexCapabilitiesProbeResult>;
      codexMcpInstallFromJson: (args: { rawJson: string; overwrite: boolean }) => Promise<CodexMcpInstallFromJsonResult>;
      codexSkillInstall: (args: {
        source: { kind: 'zip' | 'md' | 'dir'; path: string };
        targetScope: 'user' | 'project';
        projectRoot: string | null;
        overwrite: boolean;
      }) => Promise<CodexSkillInstallResult>;

      fsWatchStart: (args: { workspaceRoot?: string | null; projectRoot?: string | null }) => Promise<FsWatchStartResult>;
      onFsEvent: (cb: (evt: FsEventDTO) => void) => () => void;

      clipboardReadText: () => string;
      clipboardReadFilePaths: () => string[];
      clipboardWriteText: (text: string) => void;

      revealInFolder: (path: string) => Promise<RevealInFolderResult>;

      terminalCreateSession: (args: { id: string; cwd?: string | null; cols?: number | null; rows?: number | null }) => Promise<TerminalCreateResult>;
      terminalKillSession: (id: string) => Promise<void>;
      terminalWrite: (id: string, data: string) => void;
      terminalResize: (id: string, cols: number, rows: number) => void;
      terminalPasteImage: (args: TerminalPasteImageOptions) => Promise<TerminalPasteImageResult>;
      onTerminalEvent: (cb: (evt: TerminalEventDTO) => void) => () => void;
    };
  }
}
