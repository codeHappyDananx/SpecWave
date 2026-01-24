import type { CodexMcpServerVM, CodexMcpTransportType, HealthState } from '@specwave/contracts';

import { runCodex } from './codexCli';
import { safeEnvKeysFromCodexTransport, sanitizeCodexStderrForUi } from './sanitize';

type CodexMcpListItem = {
  name: string;
  enabled: boolean;
  disabled_reason?: string | null;
  auth_status?: string | null;
  transport: any;
};

function mapTransportType(transport: any): CodexMcpTransportType {
  const t = transport?.type;
  if (t === 'stdio') return 'stdio';
  // codex CLI 可能用 streamable_http/http 等命名，这里统一映射为 http。
  return 'http';
}

function toServerVm(item: CodexMcpListItem, health: { state: HealthState; message?: string }): CodexMcpServerVM {
  const transportType = mapTransportType(item.transport);
  const envKeys = safeEnvKeysFromCodexTransport(item.transport);
  const command = typeof item.transport?.command === 'string' ? item.transport.command : null;
  const args = Array.isArray(item.transport?.args) ? item.transport.args.filter((x: any) => typeof x === 'string') : null;
  const cwd = typeof item.transport?.cwd === 'string' ? item.transport.cwd : null;
  const url = typeof item.transport?.url === 'string' ? item.transport.url : null;
  return {
    name: item.name,
    enabled: Boolean(item.enabled),
    transportType,
    authStatus: typeof item.auth_status === 'string' ? item.auth_status : null,
    disabledReason: item.disabled_reason ?? null,
    health,
    safeConfig: { command, args, url, cwd, envKeys }
  };
}

export async function listMcpServers(args?: { cwd?: string | null }): Promise<
  | { ok: true; servers: CodexMcpServerVM[] }
  | { ok: false; error: string }
> {
  const res = await runCodex(['mcp', 'list', '--json'], { cwd: args?.cwd ?? undefined, timeoutMs: 30_000 });
  if (!res.ok) return { ok: false, error: sanitizeCodexStderrForUi(res.error) };
  try {
    const raw = JSON.parse(res.stdout) as unknown;
    if (!Array.isArray(raw)) return { ok: false, error: 'codex mcp list 输出不是数组。' };
    const servers = raw
      .map((x) => x as any)
      .filter((x) => x && typeof x.name === 'string')
      .map((x) =>
        toServerVm(
          {
            name: x.name,
            enabled: Boolean(x.enabled),
            disabled_reason: x.disabled_reason ?? null,
            auth_status: x.auth_status ?? null,
            transport: x.transport
          },
          { state: 'unknown' }
        )
      );
    return { ok: true, servers };
  } catch (err) {
    return { ok: false, error: `解析 codex mcp list 输出失败：${sanitizeCodexStderrForUi(String(err))}` };
  }
}

export type McpInstallFromJsonResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: 'invalid-input' | 'already-exists' | 'unsupported' | 'failed' };

export type McpInstallSpec =
  | {
      name: string;
      transport: { type: 'stdio'; command: string; args: string[]; env: Record<string, string> };
    }
  | { name: string; transport: { type: 'http'; url: string } };

type McpInstallJson = { name?: unknown; transport?: unknown };

function parseInstallJsonRaw(rawJson: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    const obj = JSON.parse(rawJson) as McpInstallJson;
    if (!obj || typeof obj !== 'object') return { ok: false, error: '不是有效的 JSON 对象。' };
    return { ok: true, value: obj };
  } catch {
    return { ok: false, error: 'JSON 解析失败。' };
  }
}

function requireString(v: any, label: string) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${label} 不能为空。`);
  return v.trim();
}

export function parseMcpInstallSpec(rawJson: string): { ok: true; spec: McpInstallSpec } | { ok: false; error: string } {
  const parsed = parseInstallJsonRaw(rawJson);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const name = requireString(parsed.value.name, 'name');
  const transport = parsed.value.transport as any;
  const transportType = requireString(transport?.type, 'transport.type');

  if (transportType === 'stdio') {
    const command = requireString(transport?.command, 'transport.command');
    const args = Array.isArray(transport?.args) ? transport.args.filter((x: any) => typeof x === 'string') : [];
    const envObj = transport?.env && typeof transport.env === 'object' ? transport.env : {};
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(envObj)) {
      if (typeof k !== 'string' || !k) continue;
      if (typeof v !== 'string') continue;
      env[k] = v;
    }
    return { ok: true, spec: { name, transport: { type: 'stdio', command, args, env } } };
  }

  if (transportType === 'http') {
    const url = requireString(transport?.url, 'transport.url');
    return { ok: true, spec: { name, transport: { type: 'http', url } } };
  }

  return { ok: false, error: `不支持的 transport.type：${transportType}` };
}

export function buildCodexMcpAddArgs(spec: McpInstallSpec): string[] {
  if (spec.transport.type === 'http') {
    return ['mcp', 'add', spec.name, '--url', spec.transport.url];
  }

  const envArgs: string[] = [];
  for (const [k, v] of Object.entries(spec.transport.env)) {
    envArgs.push('--env', `${k}=${v}`);
  }
  return ['mcp', 'add', spec.name, ...envArgs, '--', spec.transport.command, ...spec.transport.args];
}

export async function installMcpFromJson(args: { rawJson: string; overwrite: boolean }): Promise<McpInstallFromJsonResult> {
  const parsed = (() => {
    try {
      return parseMcpInstallSpec(args.rawJson);
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  })();
  if (!parsed.ok) return { ok: false, error: parsed.error, code: 'invalid-input' };

  try {
    const { name } = parsed.spec;

    // 同名覆盖：先查是否存在；存在且未允许覆盖，则返回提示。
    const listRes = await runCodex(['mcp', 'list', '--json'], { timeoutMs: 30_000 });
    if (listRes.ok) {
      const list = JSON.parse(listRes.stdout) as any[];
      const exists = Array.isArray(list) && list.some((x) => x && x.name === name);
      if (exists && !args.overwrite) {
        return { ok: false, error: '已存在同名 MCP 配置。', code: 'already-exists' };
      }
      if (exists && args.overwrite) {
        const rm = await runCodex(['mcp', 'remove', name], { timeoutMs: 30_000 });
        if (!rm.ok) return { ok: false, error: sanitizeCodexStderrForUi(rm.error), code: 'failed' };
      }
    }

    const cmdArgs = buildCodexMcpAddArgs(parsed.spec);
    const add = await runCodex(cmdArgs, { timeoutMs: 120_000 });
    if (!add.ok) return { ok: false, error: sanitizeCodexStderrForUi(add.error), code: 'failed' };
    return { ok: true, message: 'MCP 已安装。' };
  } catch (err) {
    return { ok: false, error: sanitizeCodexStderrForUi(String(err)), code: 'invalid-input' };
  }
}
