/**
 * A small per-process cache for values read on every request (a facility's
 * departments, its subscription state). Entries live for `ttlMs()`
 * milliseconds; writers call `invalidate(key)` so this process sees a change
 * at once, and other processes within the TTL. A TTL of 0 turns caching off.
 * Failed loads are not cached.
 */
export function ttlCache<V>(ttlMs: () => number) {
  const entries = new Map<string, { value: Promise<V>; at: number }>();
  return {
    get(key: string, load: () => Promise<V>): Promise<V> {
      const ttl = ttlMs();
      if (ttl <= 0) return load();
      const hit = entries.get(key);
      if (hit && Date.now() - hit.at < ttl) return hit.value;
      const value = load();
      entries.set(key, { value, at: Date.now() });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
    invalidate(key?: string | null) {
      if (key) entries.delete(key);
      else entries.clear();
    },
    size: () => entries.size
  };
}
