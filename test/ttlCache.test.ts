import { afterEach, describe, expect, it, vi } from 'vitest';
import { ttlCache } from '../src/utils/ttlCache.js';

describe('per-request value cache', () => {
  afterEach(() => vi.useRealTimers());

  it('reuses a value within the TTL and reloads after it', async () => {
    vi.useFakeTimers();
    const cache = ttlCache<number>(() => 5000);
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.get('f1', load)).toBe(1);
    expect(await cache.get('f1', load)).toBe(1);
    vi.advanceTimersByTime(5001);
    expect(await cache.get('f1', load)).toBe(2);
  });

  it('keeps facilities apart and forgets on invalidate', async () => {
    const cache = ttlCache<string>(() => 60_000);
    expect(await cache.get('a', async () => 'A1')).toBe('A1');
    expect(await cache.get('b', async () => 'B1')).toBe('B1');
    cache.invalidate('a');
    expect(await cache.get('a', async () => 'A2')).toBe('A2');
    expect(await cache.get('b', async () => 'B2')).toBe('B1');
    cache.invalidate();
    expect(cache.size()).toBe(0);
  });

  it('does not cache failures, and a TTL of 0 turns it off', async () => {
    const cache = ttlCache<number>(() => 60_000);
    await expect(cache.get('x', async () => { throw new Error('db down'); })).rejects.toThrow('db down');
    expect(await cache.get('x', async () => 7)).toBe(7);
    const off = ttlCache<number>(() => 0);
    let n = 0;
    await off.get('k', async () => ++n);
    await off.get('k', async () => ++n);
    expect(n).toBe(2);
  });
});
