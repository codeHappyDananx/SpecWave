export function toErrorMessage(err: unknown) {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return '未知错误。';
  const anyErr = err as any;
  if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
  try {
    return JSON.stringify(err);
  } catch {
    return '未知错误。';
  }
}

export function safeEnvKeysFromCodexTransport(transport: any): string[] {
  const envVars: unknown[] | null = Array.isArray(transport?.env_vars) ? (transport.env_vars as unknown[]) : null;
  const fromEnvVars = envVars ? envVars.filter((x: unknown): x is string => typeof x === 'string') : [];
  if (fromEnvVars.length > 0) return [...new Set(fromEnvVars)].sort();

  const env = transport?.env && typeof transport.env === 'object' ? transport.env : null;
  const keys = env ? Object.keys(env).filter((k) => typeof k === 'string') : [];
  return [...new Set(keys)].sort();
}

export function sanitizeCodexStderrForUi(raw: string) {
  const s = raw || '';
  if (!s.trim()) return '';
  // 基本脱敏：尽量移除明显的 token 形式（不追求完整匹配，只做兜底）。
  return s.replaceAll(/mcpr_[A-Za-z0-9]+/g, 'mcpr_******').replaceAll(/sk-[A-Za-z0-9]+/g, 'sk-******');
}
