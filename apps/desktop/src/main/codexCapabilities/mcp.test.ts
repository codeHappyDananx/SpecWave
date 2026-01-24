import { describe, expect, it } from 'vitest';

import { buildCodexMcpAddArgs, parseMcpInstallSpec } from './mcp';

describe('parseMcpInstallSpec', () => {
  it('支持 stdio JSON', () => {
    const raw = JSON.stringify({
      name: 'demo',
      transport: { type: 'stdio', command: 'node', args: ['a.js'], env: { TOKEN: 'x' } }
    });
    const parsed = parseMcpInstallSpec(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.transport.type).toBe('stdio');
  });

  it('支持 http JSON', () => {
    const raw = JSON.stringify({ name: 'demo', transport: { type: 'http', url: 'https://example.com/mcp' } });
    const parsed = parseMcpInstallSpec(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.transport.type).toBe('http');
  });
});

describe('buildCodexMcpAddArgs', () => {
  it('stdio 会生成 --env 与 -- 分隔', () => {
    const raw = JSON.stringify({
      name: 'demo',
      transport: { type: 'stdio', command: 'node', args: ['a.js'], env: { TOKEN: 'x' } }
    });
    const parsed = parseMcpInstallSpec(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const args = buildCodexMcpAddArgs(parsed.spec);
    expect(args[0]).toBe('mcp');
    expect(args).toContain('--env');
    expect(args).toContain('--');
  });

  it('http 会生成 --url', () => {
    const raw = JSON.stringify({ name: 'demo', transport: { type: 'http', url: 'https://example.com/mcp' } });
    const parsed = parseMcpInstallSpec(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const args = buildCodexMcpAddArgs(parsed.spec);
    expect(args).toEqual(['mcp', 'add', 'demo', '--url', 'https://example.com/mcp']);
  });
});

