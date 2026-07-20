import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Neutralise server-only and stub the DB/crypto deps so the module imports in a
// plain unit-test context. The TTL semantics themselves are covered in
// ttl-cache.test.ts; this file covers the settings layer on top of it —
// load-through, invalidation on write, and the manual bust.
vi.mock("server-only", () => ({}))

const findFirstMock = vi.fn()
const insertMock = vi.fn(() => ({
  values: () => ({ onConflictDoUpdate: async () => undefined }),
}))
vi.mock("@/db", () => ({
  db: {
    query: { appConfig: { findFirst: (...args: unknown[]) => findFirstMock(...args) } },
    insert: () => insertMock(),
  },
}))
vi.mock("@/db/schema", () => ({ appConfig: { key: {} } }))
vi.mock("./crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}))

type SettingsModule = typeof import("./settings")
let settings: SettingsModule

describe("settings cache", () => {
  beforeAll(async () => {
    // The cache captures `Date.now` when it is created at module scope, so the
    // fake clock has to be installed — and the HMR-safe global cleared — before
    // the module is imported. Hence the dynamic import.
    vi.useFakeTimers()
    vi.setSystemTime(0)
    ;(globalThis as { settingsCache?: unknown }).settingsCache = undefined
    settings = await import("./settings")
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.setSystemTime(0)
    findFirstMock.mockReset()
    settings.bustSettingsCache()
  })

  it("serves repeated reads from the cache within the TTL", async () => {
    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "closed" })
    expect(await settings.getSetting("auth.registrationMode")).toBe("closed")

    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "open" })
    vi.setSystemTime(29_000)
    expect(await settings.getSetting("auth.registrationMode")).toBe("closed")
    expect(findFirstMock).toHaveBeenCalledTimes(1)
  })

  it("reloads from the DB once the TTL has elapsed", async () => {
    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "closed" })
    await settings.getSetting("auth.registrationMode")

    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "invite" })
    vi.setSystemTime(30_001)
    expect(await settings.getSetting("auth.registrationMode")).toBe("invite")
    expect(findFirstMock).toHaveBeenCalledTimes(2)
  })

  it("bustSettingsCache forces an immediate reload", async () => {
    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "closed" })
    await settings.getSetting("auth.registrationMode")

    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "invite" })
    settings.bustSettingsCache()
    expect(await settings.getSetting("auth.registrationMode")).toBe("invite")
    expect(findFirstMock).toHaveBeenCalledTimes(2)
  })

  it("setSetting invalidates the cached key, so admin changes take effect at once", async () => {
    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "closed" })
    await settings.getSetting("auth.registrationMode")

    await settings.setSetting("auth.registrationMode", "invite")
    findFirstMock.mockResolvedValue({ key: "auth.registrationMode", value: "invite" })
    expect(await settings.getSetting("auth.registrationMode")).toBe("invite")
  })

  it("falls back to the built-in default when the row is missing, and caches it", async () => {
    findFirstMock.mockResolvedValue(undefined)
    expect(await settings.getSetting("auth.registrationMode")).toBe("open")
    expect(await settings.getSetting("auth.registrationMode")).toBe("open")
    expect(findFirstMock).toHaveBeenCalledTimes(1)
  })
})
