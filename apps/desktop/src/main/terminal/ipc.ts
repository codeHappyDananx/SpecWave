import { ipcMain } from 'electron';
import type { PtyManager } from './ptyManager';
import { saveClipboardImage, type TerminalPasteImageOptions } from './pasteImage';

export function registerTerminalIpcHandlers(pty: PtyManager) {
  ipcMain.handle(
    'specwave:terminal:create',
    async (evt, args: { id: string; cwd?: string | null; cols?: number | null; rows?: number | null }) => {
      return pty.createSession({ id: args.id, sender: evt.sender, cwd: args.cwd ?? null, cols: args.cols ?? null, rows: args.rows ?? null });
    }
  );

  ipcMain.on('specwave:terminal:write', (_evt, args: { id: string; data: string }) => {
    pty.write({ id: args.id, data: args.data });
  });

  ipcMain.on('specwave:terminal:resize', (_evt, args: { id: string; cols: number; rows: number }) => {
    pty.resize({ id: args.id, cols: args.cols, rows: args.rows });
  });

  ipcMain.handle('specwave:terminal:pasteImage', async (_evt, args: TerminalPasteImageOptions) => {
    return saveClipboardImage(args ?? {});
  });

  ipcMain.handle('specwave:terminal:kill', async (_evt, args: { id: string }) => {
    pty.kill(args.id);
  });
}
