import { describe, expect, it } from 'vitest';
import { publicCode } from '../src/domain/public-code.js';

describe('publicCode', () => {
  it('is stable, opaque and CF-prefixed', () => {
    const a = publicCode('iaai', '46257118');
    expect(a).toMatch(/^CF-[0-9A-Z]{7}$/);
    expect(publicCode('iaai', '46257118')).toBe(a);
    expect(publicCode('copart', '46257118')).not.toBe(a);
    expect(a).not.toContain('46257118');
  });
  it('matches the codes the site already uses (scripts/sync-lots.mjs)', () => {
    // values produced by scripts/sync-lots.mjs for demo lots; both implementations must agree
    expect(publicCode('copart', '72018845')).toBe('CF-8C7ZVGO');
  });
});
