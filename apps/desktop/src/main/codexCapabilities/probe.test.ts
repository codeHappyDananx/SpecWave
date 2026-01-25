import { describe, expect, it, vi } from 'vitest';

vi.mock('./mcp', () => ({ listMcpServers: vi.fn() }));
vi.mock('./skills', () => ({ scanSkills: vi.fn() }));

import { probeCodexCapabilities } from './probe';
import { listMcpServers } from './mcp';
import { scanSkills } from './skills';

describe('probeCodexCapabilities', () => {
  it('MCP 失败但 skills 成功时，返回 ok=true 且保留 mcpError', async () => {
    (listMcpServers as any).mockResolvedValue({ ok: false, error: '未找到 codex 命令。' });
    (scanSkills as any).mockResolvedValue({
      ok: true,
      skills: [
        {
          id: 'a',
          name: 'a',
          description: '',
          location: 'user',
          rootPath: 'C:\\\\skill-a',
          health: { state: 'ok' },
          safeMeta: { hasSkillMd: true, hasValidFrontMatter: true }
        }
      ]
    });

    const res = await probeCodexCapabilities({ includeConnectivityProbe: false, projectRoot: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mcpServers).toEqual([]);
    expect(res.mcpError).toBe('未找到 codex 命令。');
    expect(res.skillsError).toBe(null);
    expect(res.skills.length).toBe(1);
  });

  it('skills 失败但 MCP 成功时，返回 ok=true 且保留 skillsError', async () => {
    (listMcpServers as any).mockResolvedValue({ ok: true, servers: [] });
    (scanSkills as any).mockResolvedValue({ ok: false, error: '权限不足。' });

    const res = await probeCodexCapabilities({ includeConnectivityProbe: false, projectRoot: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.skills).toEqual([]);
    expect(res.mcpError).toBe(null);
    expect(res.skillsError).toBe('权限不足。');
  });

  it('两者都失败时，返回 ok=false', async () => {
    (listMcpServers as any).mockResolvedValue({ ok: false, error: 'mcp failed' });
    (scanSkills as any).mockResolvedValue({ ok: false, error: 'skills failed' });

    const res = await probeCodexCapabilities({ includeConnectivityProbe: false, projectRoot: null });
    expect(res.ok).toBe(false);
  });
});
