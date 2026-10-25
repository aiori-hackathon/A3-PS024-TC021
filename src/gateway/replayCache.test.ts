import { describe, it, expect } from 'vitest';
import { ReplayCache } from './replayCache';

describe('ReplayCache', () => {
  it('accepts first use and rejects the second', () => {
    const c = new ReplayCache();
    expect(c.checkAndStore('abc')).toBe(true);
    expect(c.checkAndStore('abc')).toBe(false);
  });

  it('treats different tokens independently', () => {
    const c = new ReplayCache();
    expect(c.checkAndStore('a')).toBe(true);
    expect(c.checkAndStore('b')).toBe(true);
  });

  it('forgets a fingerprint after the TTL', () => {
    let t = 0;
    const c = new ReplayCache(1000, () => t);
    c.checkAndStore('a');
    t = 1001;
    expect(c.checkAndStore('a')).toBe(true);
  });
});
