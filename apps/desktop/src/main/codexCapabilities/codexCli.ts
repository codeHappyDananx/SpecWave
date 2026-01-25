import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export type CodexRunResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string; code?: string };

let cachedWindowsCodexPs1Path: string | null | undefined;

async function resolveWindowsCodexPs1Path(): Promise<string | null> {
  if (cachedWindowsCodexPs1Path !== undefined) return cachedWindowsCodexPs1Path;
  cachedWindowsCodexPs1Path = await new Promise<string | null>((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '(Get-Command codex -ErrorAction SilentlyContinue).Definition'
      ],
      { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    child.stdout?.on('data', (buf) => {
      stdout += buf.toString('utf8');
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const p = stdout.trim();
      resolve(p && p.toLowerCase().endsWith('.ps1') ? p : null);
    });
  });
  return cachedWindowsCodexPs1Path;
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

    let child = spawn('codex', args, { cwd: resolvedCwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, timeoutMs);

    const finish = (res: CodexRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    child.on('error', (err) => {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err);
      const code = err && typeof err === 'object' && 'code' in err ? String((err as any).code) : undefined;
      if (process.platform === 'win32' && code === 'ENOENT') {
        void (async () => {
          const ps1 = await resolveWindowsCodexPs1Path();
          if (!ps1) {
            finish({ ok: false, error: '未找到 codex 命令。当前环境仅能在 PowerShell 里运行 codex，但找不到 codex.ps1。', code });
            return;
          }
          // 用 PowerShell 的 codex.ps1 作为入口（Windows 常见），避免 Node 直接 spawn .ps1 的 ENOENT。
          child = spawn(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
            { cwd: resolvedCwd, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
          );
          child.stdout?.on('data', (buf) => {
            stdout += buf.toString('utf8');
          });
          child.stderr?.on('data', (buf) => {
            stderr += buf.toString('utf8');
          });
          child.on('error', (err2) => {
            const msg2 =
              err2 && typeof err2 === 'object' && 'message' in err2 ? String((err2 as any).message) : String(err2);
            const code2 = err2 && typeof err2 === 'object' && 'code' in err2 ? String((err2 as any).code) : undefined;
            finish({ ok: false, error: msg2, code: code2 });
          });
          child.on('close', (code2) => {
            if (timedOut) {
              finish({ ok: false, error: `codex 命令执行超时（${timeoutMs}ms）。`, code: 'timeout' });
              return;
            }
            if (code2 === 0) {
              finish({ ok: true, stdout, stderr });
              return;
            }
            finish({
              ok: false,
              error: stderr.trim() || stdout.trim() || `codex 命令执行失败（exit=${code2 ?? 'unknown'}）。`,
              code: 'nonzero-exit'
            });
          });
        })();
        return;
      }
      finish({ ok: false, error: code === 'ENOENT' ? '未找到 codex 命令。请确认已安装 Codex CLI 并在 PATH 中可用。' : msg, code });
    });

    child.stdout?.on('data', (buf) => {
      stdout += buf.toString('utf8');
    });
    child.stderr?.on('data', (buf) => {
      stderr += buf.toString('utf8');
    });

    child.on('close', (code) => {
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
  });
}
