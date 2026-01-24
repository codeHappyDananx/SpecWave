import type { CodexMcpServerVM, CodexSkillVM, HealthState } from '@specwave/contracts';

import { runCodex } from './codexCli';
import { listMcpServers } from './mcp';
import { scanSkills } from './skills';
import { safeEnvKeysFromCodexTransport, sanitizeCodexStderrForUi, toErrorMessage } from './sanitize';

type ProbeResult =
  | { ok: true; checkedAt: string; mcpServers: CodexMcpServerVM[]; skills: CodexSkillVM[] }
  | { ok: false; error: string };

async function connectMcpServerViaSdk(args: {
  name: string;
  transport: any;
}): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  try {
    const transportType = args.transport?.type;
    if (transportType === 'stdio') {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

      const client = new Client({ name: `specwave-probe-${args.name}`, version: '1.0.0' }, { capabilities: {} });

      const cmd = args.transport?.command;
      const argv = args.transport?.args;
      if (typeof cmd !== 'string' || !cmd) return { ok: false, error: '缺少 command。' };
      const cliArgs = Array.isArray(argv) ? argv.filter((x: any) => typeof x === 'string') : [];

      const env = args.transport?.env && typeof args.transport.env === 'object' ? args.transport.env : undefined;
      const transport = new StdioClientTransport({
        command: cmd,
        args: cliArgs,
        env
      } as any);

      await client.connect(transport as any);
      await (client as any).close?.();
      await (transport as any).close?.();
      return { ok: true, message: '握手成功。' };
    }

    // Streamable HTTP：按官方 transport 使用 StreamableHTTPClientTransport
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

    const urlStr = args.transport?.url;
    if (typeof urlStr !== 'string' || !urlStr) return { ok: false, error: '缺少 url。' };
    const url = new URL(urlStr);
    const client = new Client({ name: `specwave-probe-${args.name}`, version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport as any);
    await (client as any).close?.();
    await (transport as any).close?.();
    return { ok: true, message: '握手成功。' };
  } catch (err) {
    return { ok: false, error: sanitizeCodexStderrForUi(toErrorMessage(err)) };
  }
}

async function getMcpTransportForProbe(name: string) {
  const res = await runCodex(['mcp', 'get', name, '--json'], { timeoutMs: 30_000 });
  if (!res.ok) return { ok: false as const, error: sanitizeCodexStderrForUi(res.error) };
  try {
    const obj = JSON.parse(res.stdout) as any;
    return { ok: true as const, transport: obj?.transport };
  } catch (err) {
    return { ok: false as const, error: `解析 codex mcp get 输出失败：${sanitizeCodexStderrForUi(String(err))}` };
  }
}

function withHealth(server: CodexMcpServerVM, health: { state: HealthState; message?: string }): CodexMcpServerVM {
  return { ...server, health };
}

export async function probeCodexCapabilities(args: { includeConnectivityProbe: boolean; projectRoot: string | null }): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();

  const [mcpRes, skillsRes] = await Promise.all([listMcpServers({ cwd: args.projectRoot }), scanSkills({ projectRoot: args.projectRoot })]);

  if (!mcpRes.ok && !skillsRes.ok) {
    return { ok: false, error: [mcpRes.ok ? null : mcpRes.error, skillsRes.ok ? null : skillsRes.error].filter(Boolean).join('\n') };
  }

  const mcpServers = mcpRes.ok ? mcpRes.servers : [];
  const skills = skillsRes.ok ? skillsRes.skills : [];

  if (!args.includeConnectivityProbe || mcpServers.length === 0) {
    return { ok: true, checkedAt, mcpServers, skills };
  }

  const probed: CodexMcpServerVM[] = [];

  for (const s of mcpServers) {
    if (!s.enabled) {
      probed.push(withHealth(s, { state: 'unknown', message: s.disabledReason ? `已禁用：${s.disabledReason}` : '已禁用。' }));
      continue;
    }

    const t = await getMcpTransportForProbe(s.name);
    if (!t.ok) {
      probed.push(withHealth(s, { state: 'error', message: t.error }));
      continue;
    }

    const envKeys = safeEnvKeysFromCodexTransport(t.transport);
    const safeConfig = {
      ...s.safeConfig,
      envKeys,
      url: typeof t.transport?.url === 'string' ? t.transport.url : s.safeConfig.url ?? null,
      command: typeof t.transport?.command === 'string' ? t.transport.command : s.safeConfig.command ?? null,
      args: Array.isArray(t.transport?.args) ? t.transport.args.filter((x: any) => typeof x === 'string') : s.safeConfig.args ?? null
    };
    const s2: CodexMcpServerVM = { ...s, safeConfig };

    const conn = await connectMcpServerViaSdk({ name: s.name, transport: t.transport });
    if (conn.ok) probed.push(withHealth(s2, { state: 'ok', message: conn.message }));
    else probed.push(withHealth(s2, { state: 'error', message: conn.error }));
  }

  return { ok: true, checkedAt, mcpServers: probed, skills };
}
