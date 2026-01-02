import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Windows 环境下 GPU 进程偶发崩溃时，先用软渲染保证可用性（后续可做成可配置项）。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

registerIpcHandlers();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#F3F4F6',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 开发态：F12 打开 DevTools；生产态：禁用是更安全的默认值（后续可加偏好开关）。
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.setAppUserModelId('ai.specwave');

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
