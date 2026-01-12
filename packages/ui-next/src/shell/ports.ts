export type TerminalEvent =
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number; signal?: number | null }
  | { type: 'error'; id: string; error: string };

export type SubscribeTerminalEvent = (cb: (evt: TerminalEvent) => void) => () => void;

