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

contextBridge.exposeInMainWorld('specwave', {
  ping: () => 'pong',
  openMainWindow: (projectPath?: string | null) =>
    ipcRenderer.invoke('specwave:openMainWindow', { projectPath }) as Promise<void>,
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
    ipcRenderer.invoke('specwave:saveTextFile', { filePath, text, ifMatchSha256 }) as Promise<SaveTextFileResult>
});

declare global {
  interface Window {
    specwave: {
      ping: () => string;
      openMainWindow: (projectPath?: string | null) => Promise<void>;
      quitApp: () => Promise<void>;
      getRecentProjects: () => Promise<RecentProjectDTO[]>;
      touchRecentProject: (path: string) => Promise<RecentProjectDTO[]>;
      removeRecentProject: (path: string) => Promise<RecentProjectDTO[]>;
      selectDirectory: () => Promise<string | null>;
      readDirectory: (dirPath: string) => Promise<ReadDirectoryResult>;
      readTextFile: (filePath: string) => Promise<ReadTextFileResult>;
      saveTextFile: (filePath: string, text: string, ifMatchSha256?: string) => Promise<SaveTextFileResult>;
    };
  }
}
