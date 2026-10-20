/**
 * Minimal in-process TTL cache with in-flight de-duplication.
 *
 * Concurrent callers for the same key share one pending promise, so a burst
 * of identical dashboard requests makes one set of upstream queries.
 * Rejected loads are evicted immediately and never cached.
 *
 * (Next's `'use cache'` was not used here because errors crossing that
 * boundary are serialized and lose their class, which breaks the API route's
 * error mapping.)
 */
export interface TtlCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  clear(): void;
  readonly size: number;
}

export function createTtlCache<T>(options: { ttlMs: number; maxEntries: number; now?: () => number }): TtlCache<T> {
  const now = options.now ?? Date.now;
  const entries = new Map<string, { expires: number; value: Promise<T> }>();

  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expires > now()) {
        // Refresh recency for LRU eviction.
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }
      entries.delete(key);

      const value = load();
      entries.set(key, { expires: now() + options.ttlMs, value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });

      while (entries.size > options.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return value;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
