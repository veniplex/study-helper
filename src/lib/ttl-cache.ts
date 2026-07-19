/**
 * A minimal in-process TTL cache. Values live for `ttlMs` from the moment they
 * are set; a `get` past expiry evicts the entry and misses. `now` is injectable
 * so the TTL behaviour is unit-testable with a fake clock.
 *
 * Intended for short-lived caching of hot, rarely-changing reads (e.g. app
 * settings) — NOT a general-purpose LRU. `null` is a cacheable value (distinct
 * from a miss, which returns `undefined`).
 */
export type TtlCache<V> = {
  get(key: string): V | undefined
  set(key: string, value: V): void
  delete(key: string): void
  clear(): void
}

export function createTtlCache<V>(ttlMs: number, now: () => number = Date.now): TtlCache<V> {
  const store = new Map<string, { value: V; expires: number }>()
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) return undefined
      if (entry.expires <= now()) {
        store.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      store.set(key, { value, expires: now() + ttlMs })
    },
    delete(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}
