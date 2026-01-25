import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export type CodexRunResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string; code?: string };

type WindowsCodexLaunch =
  | { kind: 'ps1'; path: string }
  | { kind: 'exe'; path: string }
  | null;

let cachedWindowsCodexLaunch: WindowsCodexLaunch | undefined;

async function resolveWindowsCodexLaunch(): Promise<WindowsCodexLaunch> {
  if (cachedWindowsCodexLaunch !== undefined) return cachedWindowsCodexLaunch;
  cachedWindowsCodexLaunch = await new Promise<WindowsCodexLaunch>((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '(Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { \"$($_.CommandType)|$($_.Definition)\" })'
      ],
      { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    child.stdout?.on('data', (buf) => {
      stdout += buf.toString('utf8');
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const raw = stdout.trim();
      if (!raw) {
        resolve(null);
        return;
      }
      const [commandType, definition] = raw.split('|', 2);
      const def = (definition ?? '').trim();
      const ct = (commandType ?? '').trim().toLowerCase();
      if (!def) {
        resolve(null);
        return;
      }
      const lower = def.toLowerCase();
      if (lower.endsWith('.ps1')) {
        resolve({ kind: 'ps1', path: def });
        return;
      }
      if (lower.endsWith('.exe') || ct === 'application') {
        resolve({ kind: 'exe', path: def });
        return;
      }
      resolve(null);
    });
  });
  return cachedWindowsCodexLaunch;
}

async function spawnCodexProcess(args: string[], opts: { cwd?: string }) {
  if (process.platform !== 'win32') {
    return spawn('codex', args, { cwd: opts.cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  const launch = await resolveWindowsCodexLaunch();
  if (launch?.kind === 'exe') {
    return spawn(launch.path, args, { cwd: opts.cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  if (launch?.kind === 'ps1') {
    return spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launch.path, ...args],
      { cwd: opts.cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  }

  // 兜底：尝试直接执行（某些环境可能是 exe/cmd，但未被 Get-Command 命中）
  return spawn('codex', args, { cwd: opts.cwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function runCodex(args: string[], options?: { cwd?: string | null; timeoutMs?: number }): Promise<CodexRunResult> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const resolvedCwd = (() => {
    const cwd = options?.cwd;
    if (typeof cwd !== 'string') return undefined;
    const trimmed = cwd.trim();
    if (!trimmed) return undefined;
    try {
      if (statSync(trimmed).isDirectory()) return trimmed;
    } catch {}
    return undefined;
  })();

  return await new Promise<CodexRunResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    let child: ReturnType<typeof spawn> | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child?.kill();
      } catch {}
    }, timeoutMs);

    const finish = (res: CodexRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    const bind = (proc: ReturnType<typeof spawn>) => {
      proc.stdout?.on('data', (buf) => {
        stdout += buf.toString('utf8');
      });
      proc.stderr?.on('data', (buf) => {
        stderr += buf.toString('utf8');
      });

      proc.on('error', (err) => {
        // 只允许“当前进程”结算，避免旧进程的 close 抢先 finish（Windows 下 ENOENT 常见）。
        if (proc !== child) return;

        const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err);
        const code = err && typeof err === 'object' && 'code' in err ? String((err as any).code) : undefined;
        finish({ ok: false, error: code === 'ENOENT' ? '未找到 codex 命令。请确认已安装 Codex CLI 并在 PATH 中可用。' : msg, code });
      });

      proc.on('close', (code) => {
        if (proc !== child) return;

        if (timedOut) {
          finish({ ok: false, error: `codex 命令执行超时（${timeoutMs}ms）。`, code: 'timeout' });
          return;
        }
        if (code === 0) {
          finish({ ok: true, stdout, stderr });
          return;
        }
        finish({ ok: false, error: stderr.trim() || stdout.trim() || `codex 命令执行失败（exit=${code ?? 'unknown'}）。`, code: 'nonzero-exit' });
      });
    };

    void (async () => {
      try {
        child = await spawnCodexProcess(args, { cwd: resolvedCwd });
        bind(child);
      } catch (err) {
        finish({ ok: false, error: String(err) });
      }
    })();
  });
}
