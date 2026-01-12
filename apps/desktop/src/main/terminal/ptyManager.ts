import type { WebContents } from 'electron';
import * as pty from 'node-pty';

export type TerminalEventDTO =
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number; signal?: number | null }
  | { type: 'error'; id: string; error: string };

type Session = {
  id: string;
  pty: pty.IPty;
  sender: WebContents;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

function defaultShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || 'bash';
}

function defaultShellArgs(shell: string) {
  if (process.platform !== 'win32') return [];
  // Windows 下用 PowerShell 作为默认交互 shell：保持输出可读、并避免 cmd 编码坑。
  // 如需自定义，可通过环境变量 `SPECWAVE_TERMINAL_SHELL` 覆盖 shell。
  if (shell.toLowerCase().includes('powershell')) return ['-NoLogo'];
  return [];
}

export class PtyManager {
  private sessions = new Map<string, Session>();

  disposeByWebContents(webContentsId: number) {
    for (const [id, s] of this.sessions) {
      if (s.sender.id !== webContentsId) continue;
      try {
        s.pty.kill();
      } catch {}
      this.sessions.delete(id);
    }
  }

  disposeAll() {
    for (const [id, s] of this.sessions) {
      try {
        s.pty.kill();
      } catch {}
      this.sessions.delete(id);
    }
  }

  createSession(args: {
    id: string;
    sender: WebContents;
    cwd?: string | null;
    cols?: number | null;
    rows?: number | null;
  }): { ok: true } | { ok: false; error: string } {
    try {
      const existing = this.sessions.get(args.id);
      if (existing) {
        try {
          existing.pty.kill();
        } catch {}
        this.sessions.delete(args.id);
      }

      const shell = process.env.SPECWAVE_TERMINAL_SHELL || defaultShell();
      const p = pty.spawn(shell, defaultShellArgs(shell), {
        name: 'xterm-256color',
        cols: args.cols ?? 80,
        rows: args.rows ?? 24,
        cwd: args.cwd ?? process.cwd(),
        handleFlowControl: true,
        env: {
          ...process.env,
          TERM: 'xterm-256color'
        }
      });

      const sender = args.sender;
      const send = (evt: TerminalEventDTO) => {
        if (sender.isDestroyed()) return;
        sender.send('specwave:terminal:event', evt);
      };

      // 关键处理节点：终端输出为流式事件，必须由主进程统一转发，避免 UI 层直接接触 Node 能力。
      // Windows 下 PowerShell 会在启动瞬间刷出多段输出；如果逐条 IPC 转发，容易把渲染与消息队列打爆，表现为“输入被阻断/无回显”。这里做无损合并：合并后再发送。
      const PAUSE = '\x13'; // XOFF
      const RESUME = '\x11'; // XON
      const FLUSH_INTERVAL_MS = 16;
      const FLOW_HIGH_WATER = 1_200_000;
      const FLOW_LOW_WATER = 320_000;

      let pending = '';
      let pendingLen = 0;
      let scheduled = false;
      let flowPaused = false;

      const tryResume = () => {
        if (!flowPaused) return;
        if (pendingLen > FLOW_LOW_WATER) return;
        flowPaused = false;
        try {
          p.write(RESUME);
        } catch {}
      };

      const flush = () => {
        scheduled = false;
        if (!pending) {
          tryResume();
          return;
        }
        const chunk = pending;
        pending = '';
        pendingLen = 0;
        send({ type: 'data', id: args.id, data: chunk });
        tryResume();
      };

      const scheduleFlush = () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(flush, FLUSH_INTERVAL_MS);
      };

      p.onData((data) => {
        if (!data) return;
        pending += data;
        pendingLen += data.length;

        if (!flowPaused && pendingLen >= FLOW_HIGH_WATER) {
          flowPaused = true;
          try {
            p.write(PAUSE);
          } catch {}
        }

        // 防止极端情况下 pending 过大占用内存；仍不丢数据，只是提前 flush。
        if (pendingLen >= 3_000_000) {
          flush();
          return;
        }

        scheduleFlush();
      });

      // 关键处理节点：进程退出属于“语义分界点”（仍可显示历史输出，但不再可写入）。
      p.onExit((e) => {
        // 退出前先把剩余输出刷出去，避免尾部丢失。
        try {
          flush();
        } catch {}
        send({ type: 'exit', id: args.id, exitCode: e.exitCode, signal: e.signal ?? null });
        this.sessions.delete(args.id);
      });

      this.sessions.set(args.id, { id: args.id, pty: p, sender });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  write(args: { id: string; data: string }) {
    const s = this.sessions.get(args.id);
    if (!s) return;
    try {
      s.pty.write(args.data);
    } catch (err) {
      if (!s.sender.isDestroyed()) {
        s.sender.send('specwave:terminal:event', { type: 'error', id: args.id, error: toErrorMessage(err) } satisfies TerminalEventDTO);
      }
    }
  }

  resize(args: { id: string; cols: number; rows: number }) {
    const s = this.sessions.get(args.id);
    if (!s) return;
    try {
      s.pty.resize(args.cols, args.rows);
    } catch {}
  }

  kill(id: string) {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      s.pty.kill();
    } catch {}
    this.sessions.delete(id);
  }
}
