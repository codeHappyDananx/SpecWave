import { describe, expect, it } from 'vitest';

import { parseSkillFrontMatter, sanitizeWindowsFileName } from './skills';

describe('parseSkillFrontMatter', () => {
  it('能解析 name 与 description', () => {
    const md = ['---', 'name: demo-skill', 'description: 这是描述', '---', '', '正文'].join('\n');
    expect(parseSkillFrontMatter(md)).toEqual({ name: 'demo-skill', description: '这是描述', ok: true });
  });

  it('缺少 front matter 时返回 ok=false', () => {
    const md = '# title\n';
    expect(parseSkillFrontMatter(md).ok).toBe(false);
  });
});

describe('sanitizeWindowsFileName', () => {
  it('会替换 Windows 不允许字符', () => {
    expect(sanitizeWindowsFileName('a<b>c:d')).toBe('a-b-c-d');
  });
});

