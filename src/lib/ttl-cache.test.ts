import { describe, expect, it } from "vitest"
import { createTtlCache } from "./ttl-cache"

describe("createTtlCache", () => {
  it("returns undefined for a missing key", () => {
    const cache = createTtlCache<number>(1000)
    expect(cache.get("nope")).toBeUndefined()
  })

  it("returns a cached value within the TTL window", () => {
    let clock = 0
    const cache = createTtlCache<string>(30_000, () => clock)
    cache.set("k", "v")
    clock = 29_999
    expect(cache.get("k")).toBe("v")
  })

  it("evicts and misses once the TTL has elapsed", () => {
    let clock = 0
    const cache = createTtlCache<string>(30_000, () => clock)
    cache.set("k", "v")
    clock = 30_000 // exactly at expiry counts as expired
    expect(cache.get("k")).toBeUndefined()
    // a re-set after expiry starts a fresh window
    cache.set("k", "v2")
    clock = 45_000
    expect(cache.get("k")).toBe("v2")
    clock = 60_001
    expect(cache.get("k")).toBeUndefined()
  })

  it("caches null distinctly from a miss", () => {
    const cache = createTtlCache<string | null>(1000)
    cache.set("k", null)
    expect(cache.get("k")).toBeNull()
    expect(cache.get("other")).toBeUndefined()
  })

  it("delete removes a single entry, clear empties the cache", () => {
    const cache = createTtlCache<number>(1000)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.delete("a")
    expect(cache.get("a")).toBeUndefined()
    expect(cache.get("b")).toBe(2)
    cache.clear()
    expect(cache.get("b")).toBeUndefined()
  })
})
