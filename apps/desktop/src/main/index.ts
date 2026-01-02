import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readCliArg(name: string) {
  const prefix = `${name}=`;
  for (const arg of process.argv) {
    if (arg === name) return '1';
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

// WelcomePage 背景动效依赖 WebGL：默认启用硬件加速以保证帧率。
// 如果遇到显卡驱动/兼容问题，可临时设置环境变量 `SPECWAVE_DISABLE_GPU=1` 再禁用 GPU 排查。
//
// Windows 上 GPU 进程偶发崩溃时，会导致 WebGL 反复丢上下文并出现明显卡顿；这里提供“自动自救”：
// - 默认用 ANGLE D3D11；若 GPU 进程连续崩溃，会自动重启并切换到 D3D9；再不行才禁用 GPU。
const gpuFallbackStage = Number(readCliArg('--specwave-gpu-fallback-stage') || process.env.SPECWAVE_GPU_FALLBACK_STAGE || '0');
const disableGpu = (readCliArg('--specwave-disable-gpu') || process.env.SPECWAVE_DISABLE_GPU || '0') === '1';
const angle = (readCliArg('--specwave-angle') || process.env.SPECWAVE_ANGLE || 'd3d11').toLowerCase();
const openDevTools = (readCliArg('--specwave-open-devtools') || process.env.SPECWAVE_OPEN_DEVTOOLS || '0') === '1';

if (disableGpu) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
} else {
  app.commandLine.appendSwitch('use-angle', angle);
}

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

  // DevTools 默认不自动打开（它会显著拖慢 WebGL 背景帧率）；需要时手动打开即可。
  if (process.env.ELECTRON_RENDERER_URL && openDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.setAppUserModelId('ai.specwave');

app.whenReady().then(() => {
  let crashWindowStartMs = 0;
  let crashCount = 0;

  const relaunchWithArgs = (patch: Record<string, string>) => {
    const nextArgs = [...process.argv.slice(1)];
    for (const [k, v] of Object.entries(patch)) {
      const key = k;
      const prefix = `${key}=`;
      for (let i = nextArgs.length - 1; i >= 0; i--) {
        const a = nextArgs[i]!;
        if (a === key || a.startsWith(prefix)) nextArgs.splice(i, 1);
      }
      nextArgs.push(`${key}=${v}`);
    }
    app.relaunch({ args: nextArgs });
    app.exit(0);
  };

  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return;
    if (disableGpu) return;

    const now = Date.now();
    if (!crashWindowStartMs || now - crashWindowStartMs > 12_000) {
      crashWindowStartMs = now;
      crashCount = 0;
    }
    crashCount += 1;
    if (crashCount < 2) return;

    // stage 0: D3D11 → D3D9
    if (gpuFallbackStage <= 0) {
      relaunchWithArgs({ '--specwave-angle': 'd3d9', '--specwave-gpu-fallback-stage': '1' });
      return;
    }

    // stage 1: 仍然崩溃 → 禁用 GPU
    if (gpuFallbackStage === 1) {
      relaunchWithArgs({ '--specwave-disable-gpu': '1', '--specwave-gpu-fallback-stage': '2' });
    }
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
