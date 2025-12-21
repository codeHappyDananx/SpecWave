export type PerfLogPayload = {
  event: string
  source?: 'renderer' | 'main'
  durationMs?: number
  [key: string]: unknown
}

export function isPerfEnabled(): boolean {
  return window.electronAPI?.perfEnabled === true
}

export function perfNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function perfLog(event: string, data: Record<string, unknown> = {}): void {
  if (!isPerfEnabled()) return
  const payload: PerfLogPayload = { event, source: 'renderer', ...data }
  void window.electronAPI?.perfLog(payload)
}
