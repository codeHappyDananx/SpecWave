import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export type CodexRunResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string; code?: string };

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

    const child = spawn('codex', args, {
      cwd: resolvedCwd,
      windowsHide: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

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
