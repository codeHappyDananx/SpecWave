import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';
import { clearGpuPrefsSync, loadGpuPrefsSync, saveGpuPrefsSync } from './gpuPrefs';
import { registerTerminalIpcHandlers } from './terminal/ipc';
import { PtyManager } from './terminal/ptyManager';

let mainWindow: BrowserWindow | null = null;
let welcomeWindow: BrowserWindow | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ptyManager = new PtyManager();

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
// - 默认用 ANGLE D3D11；若 GPU 进程连续崩溃，会自动重启并尝试更稳的后端组合；直到窗口可用为止。
//
// 注意：Chromium 默认会在 GPU 崩溃频繁时，按 domain 封禁 3D APIs（WebGL），会让人误以为“CSS/动效没生效”。
// 这里显式关闭该行为，避免一次崩溃后“直到重启都没法创建 WebGL”。
const isDevAtBoot = Boolean(process.env.ELECTRON_RENDERER_URL);
const userDataDir = readCliArg('--specwave-user-data-dir') || process.env.SPECWAVE_USER_DATA_DIR || null;

if (userDataDir) {
  try {
    // 开发环境建议使用独立 userData，避免多实例/锁文件导致 Chromium cache “拒绝访问”。（见 `start.bat`）
    app.setPath('userData', userDataDir);
  } catch (err) {
    console.error(`[SpecWave] 设置 userData 目录失败：${userDataDir}`);
    console.error(err);
  }
}

const resetGpuPrefs = (readCliArg('--specwave-reset-gpu-prefs') || process.env.SPECWAVE_RESET_GPU_PREFS || '0') === '1';
if (resetGpuPrefs) clearGpuPrefsSync();
const persistedGpuPrefs = loadGpuPrefsSync();

const gpuFallbackStage = Number(
  readCliArg('--specwave-gpu-fallback-stage') ||
    process.env.SPECWAVE_GPU_FALLBACK_STAGE ||
    (persistedGpuPrefs?.fallbackStage != null ? String(persistedGpuPrefs.fallbackStage) : '') ||
    '0'
);
const disableGpu =
  (readCliArg('--specwave-disable-gpu') ||
    process.env.SPECWAVE_DISABLE_GPU ||
    (persistedGpuPrefs?.disableGpu ? '1' : '0') ||
    '0') === '1';
const angle = (
  readCliArg('--specwave-angle') ||
  process.env.SPECWAVE_ANGLE ||
  persistedGpuPrefs?.angle ||
  'd3d11'
).toLowerCase();
const useGl = (readCliArg('--specwave-use-gl') || process.env.SPECWAVE_USE_GL || persistedGpuPrefs?.useGl || '').toLowerCase();
const openDevTools = (readCliArg('--specwave-open-devtools') || process.env.SPECWAVE_OPEN_DEVTOOLS || '0') === '1';
const disableGpuSandbox =
  (readCliArg('--specwave-disable-gpu-sandbox') ||
    process.env.SPECWAVE_DISABLE_GPU_SANDBOX ||
    (persistedGpuPrefs?.disableGpuSandbox ? '1' : '') ||
    '0') === '1';

app.disableDomainBlockingFor3DAPIs();

if (disableGpuSandbox) {
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

if (useGl) {
  app.commandLine.appendSwitch('use-gl', useGl);
}

if (disableGpu) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
} else {
  app.commandLine.appendSwitch('use-angle', angle);
}

console.log(
  `[SpecWave] GPU 启动参数：disableGpu=${disableGpu ? '1' : '0'} angle=${angle} useGl=${useGl || 'default'} disableGpuSandbox=${disableGpuSandbox ? '1' : '0'} stage=${gpuFallbackStage} userData=${app.getPath('userData')}`
);

function attachWelcomeLogForwarding(win: BrowserWindow) {
  // 把 WelcomePage 的关键日志从 renderer 转发到终端，便于排查“某个动效随机为黑屏/不渲染”。
  // 只转发带固定前缀的日志，避免刷屏。
  win.webContents.on('console-message', (details) => {
    const { level, message } = details;
    if (!message.includes('[SpecWave][Welcome]')) return;
    const prefix = '[SpecWave][Renderer]';
    if (level === 'error') console.error(`${prefix} ${message}`);
    else if (level === 'warning') console.warn(`${prefix} ${message}`);
    else console.log(`${prefix} ${message}`);
  });
}

function loadRenderer(win: BrowserWindow, query: Record<string, string>) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    void win.loadURL(url.toString());
    return;
  }

  void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
}

function createMainWindow(args?: { projectPath?: string | null; onReadyToShow?: () => void }) {
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

  const win = mainWindow;
  const webContentsId = win.webContents.id;

  attachWelcomeLogForwarding(win);

  win.on('ready-to-show', () => {
    win.show();
    args?.onReadyToShow?.();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  loadRenderer(win, {
    specwaveWindow: 'main',
    ...(args?.projectPath ? { projectPath: args.projectPath } : {})
  });

  // DevTools 默认不自动打开（它会显著拖慢 WebGL 背景帧率）；需要时手动打开即可。
  if (process.env.ELECTRON_RENDERER_URL && openDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('closed', () => {
    ptyManager.disposeByWebContents(webContentsId);
    mainWindow = null;
  });
}

function createWelcomeWindow() {
  welcomeWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: '#05070d',
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const win = welcomeWindow;
  const webContentsId = win.webContents.id;

  attachWelcomeLogForwarding(win);

  win.on('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  loadRenderer(win, { specwaveWindow: 'welcome' });

  // DevTools 默认不自动打开（它会显著拖慢 WebGL 背景帧率）；需要时手动打开即可。
  if (process.env.ELECTRON_RENDERER_URL && openDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('closed', () => {
    ptyManager.disposeByWebContents(webContentsId);
    welcomeWindow = null;
  });

  return win;
}

async function openMainWindow(args: { projectPath?: string | null }) {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  // Welcome → Main：避免用户看到“窗口空白/闪一下”，先隐藏 Welcome，Main 准备好再关掉。
  welcomeWindow?.hide();

  createMainWindow({
    projectPath: args.projectPath ?? null,
    onReadyToShow: () => {
      welcomeWindow?.close();
    }
  });
}

async function openWelcomeWindow(args?: { fromWindowId?: number | null }) {
  const fromWin = args?.fromWindowId != null ? BrowserWindow.fromId(args.fromWindowId) : null;
  if (welcomeWindow) {
    welcomeWindow.show();
    welcomeWindow.focus();
    if (fromWin && fromWin.id !== welcomeWindow.id) fromWin.close();
    return;
  }

  // Main → Welcome：避免用户看到“窗口空白/闪一下”，先隐藏来源窗口，Welcome 准备好再关掉。
  fromWin?.hide();

  const win = createWelcomeWindow();

  if (fromWin) {
    win.once('ready-to-show', () => {
      try {
        fromWin.close();
      } catch {}
    });
  }
}

registerIpcHandlers({
  openMainWindow,
  openWelcomeWindow,
  quitApp: () => app.quit()
});
registerTerminalIpcHandlers(ptyManager);

app.setAppUserModelId('ai.specwave');

app.whenReady().then(() => {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  let crashWindowStartMs = 0;
  let crashCount = 0;
  const persistGpuPrefs = (next: {
    angle?: string;
    useGl?: string;
    disableGpu?: boolean;
    disableGpuSandbox?: boolean;
    fallbackStage: number;
  }) => {
    saveGpuPrefsSync({
      ...persistedGpuPrefs,
      ...next,
      updatedAt: Date.now()
    });
  };

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
    if (isDev) {
      // 开发模式不要自动重启：electron-vite 会跟着退出，导致 renderer URL 失效并出现“白屏无报错”。
      // 开发时请用环境变量/启动参数手动切换 ANGLE 后再重启：
      // - PowerShell：$env:SPECWAVE_ANGLE='d3d9'; pnpm dev
      // - 或：$env:SPECWAVE_ANGLE='warp'; pnpm dev
      // - 或：$env:SPECWAVE_USE_GL='swiftshader-webgl'; pnpm dev
      // - 或：.\start.bat（先 cd 到仓库根目录）
      console.error('[SpecWave] GPU 进程异常退出：开发模式不会自动重启，请手动切换 ANGLE 后重启。');
      return;
    }

    const now = Date.now();
    if (!crashWindowStartMs || now - crashWindowStartMs > 12_000) {
      crashWindowStartMs = now;
      crashCount = 0;
    }
    crashCount += 1;
    if (crashCount < 2) return;

    // stage 0: D3D11 → D3D11 + disable-gpu-sandbox（部分驱动在 sandbox 下更容易崩溃）
    if (gpuFallbackStage <= 0) {
      persistGpuPrefs({ angle: 'd3d11', useGl: '', disableGpu: false, disableGpuSandbox: true, fallbackStage: 1 });
      relaunchWithArgs({
        '--specwave-angle': 'd3d11',
        '--specwave-use-gl': '',
        '--specwave-disable-gpu-sandbox': '1',
        '--specwave-gpu-fallback-stage': '1'
      });
      return;
    }

    // stage 1: 仍然崩溃 → D3D9（更老但通常更稳；注意：多数环境下仅 WebGL1）
    if (gpuFallbackStage === 1) {
      persistGpuPrefs({ angle: 'd3d9', useGl: '', disableGpu: false, disableGpuSandbox: false, fallbackStage: 2 });
      relaunchWithArgs({
        '--specwave-angle': 'd3d9',
        '--specwave-use-gl': '',
        '--specwave-disable-gpu-sandbox': '0',
        '--specwave-gpu-fallback-stage': '2'
      });
      return;
    }

    // stage 2: 仍然崩溃 → WARP（软件 D3D11，通常更稳且能提供 WebGL2）
    if (gpuFallbackStage === 2) {
      persistGpuPrefs({ angle: 'warp', useGl: '', disableGpu: false, disableGpuSandbox: false, fallbackStage: 3 });
      relaunchWithArgs({
        '--specwave-angle': 'warp',
        '--specwave-use-gl': '',
        '--specwave-disable-gpu-sandbox': '0',
        '--specwave-gpu-fallback-stage': '3'
      });
      return;
    }

    // stage 3: 仍然崩溃 → SwiftShader（软件 WebGL）
    if (gpuFallbackStage === 3) {
      persistGpuPrefs({ useGl: 'swiftshader-webgl', disableGpu: false, disableGpuSandbox: false, fallbackStage: 4 });
      relaunchWithArgs({ '--specwave-use-gl': 'swiftshader-webgl', '--specwave-gpu-fallback-stage': '4' });
      return;
    }

    // stage 4: 仍然崩溃 → 禁用 GPU（保证窗口可用）
    if (gpuFallbackStage === 4) {
      persistGpuPrefs({ disableGpu: true, disableGpuSandbox: false, fallbackStage: 5 });
      relaunchWithArgs({ '--specwave-disable-gpu': '1', '--specwave-gpu-fallback-stage': '5' });
    }
  });

  createWelcomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWelcomeWindow();
  });
});

app.on('before-quit', () => {
  ptyManager.disposeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
