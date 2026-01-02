import { contextBridge, ipcRenderer } from 'electron';

export type DirEntryDTO = {
  name: string;
  path: string;
  kind: 'dir' | 'file';
};

export type ReadDirectoryResult = { ok: true; entries: DirEntryDTO[] } | { ok: false; error: string };
export type ReadTextFileResult = { ok: true; text: string; sha256: string } | { ok: false; error: string };
export type SaveTextFileResult =
  | { ok: true; sha256: string }
  | { ok: false; error: string }
  | { ok: false; conflict: true; error: string };

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
  selectDirectory: () => ipcRenderer.invoke('specwave:selectDirectory') as Promise<string | null>,
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('specwave:readDirectory', { dirPath }) as Promise<ReadDirectoryResult>,
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke('specwave:readTextFile', { filePath }) as Promise<ReadTextFileResult>,
  saveTextFile: (filePath: string, text: string, ifMatchSha256?: string) =>
    ipcRenderer.invoke('specwave:saveTextFile', { filePath, text, ifMatchSha256 }) as Promise<SaveTextFileResult>,

  terminalCreateSession: (args: { id: string; cwd?: string | null; cols?: number | null; rows?: number | null }) =>
    ipcRenderer.invoke('specwave:terminal:create', args) as Promise<TerminalCreateResult>,
  terminalKillSession: (id: string) => ipcRenderer.invoke('specwave:terminal:kill', { id }) as Promise<void>,
  terminalWrite: (id: string, data: string) => ipcRenderer.send('specwave:terminal:write', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.send('specwave:terminal:resize', { id, cols, rows }),
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
      selectDirectory: () => Promise<string | null>;
      readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
      readTextFile: (filePath: string) => Promise<ReadTextFileResult>;
      saveTextFile: (filePath: string, text: string, ifMatchSha256?: string) => Promise<SaveTextFileResult>;

      terminalCreateSession: (args: { id: string; cwd?: string | null; cols?: number | null; rows?: number | null }) => Promise<TerminalCreateResult>;
      terminalKillSession: (id: string) => Promise<void>;
      terminalWrite: (id: string, data: string) => void;
      terminalResize: (id: string, cols: number, rows: number) => void;
      onTerminalEvent: (cb: (evt: TerminalEventDTO) => void) => () => void;
    };
  }
}
