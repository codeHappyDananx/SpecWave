import { describe, expect, it } from 'vitest';

import { safeEnvKeysFromCodexTransport, sanitizeCodexStderrForUi } from './sanitize';

describe('safeEnvKeysFromCodexTransport', () => {
  it('优先使用 env_vars', () => {
    expect(safeEnvKeysFromCodexTransport({ env_vars: ['B', 'A', 'A'], env: { SECRET: 'x' } })).toEqual(['A', 'B']);
  });

  it('回退到 env 键名', () => {
    expect(safeEnvKeysFromCodexTransport({ env: { TOKEN: 'x', Z: 'y' } })).toEqual(['TOKEN', 'Z']);
  });
});

describe('sanitizeCodexStderrForUi', () => {
  it('会打码 mcpr_ 与 sk- 形式的凭证片段', () => {
    const s = 'bad mcpr_ABC123 and sk-XYZ999';
    expect(sanitizeCodexStderrForUi(s)).toContain('mcpr_******');
    expect(sanitizeCodexStderrForUi(s)).toContain('sk-******');
    expect(sanitizeCodexStderrForUi(s)).not.toContain('mcpr_ABC123');
    expect(sanitizeCodexStderrForUi(s)).not.toContain('sk-XYZ999');
  });
});

