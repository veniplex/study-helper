import { afterEach, describe, expect, it, vi } from "vitest"
import { env } from "./env"

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("falls back to the dev database outside production", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("DATABASE_URL", undefined)
    expect(env.DATABASE_URL).toContain("localhost")
  })

  it("throws in production when DATABASE_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATABASE_URL", undefined)
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/)
  })

  it("throws in production when APP_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("APP_URL", undefined)
    expect(() => env.APP_URL).toThrow(/APP_URL/)
  })

  it("uses the real value when set", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATABASE_URL", "postgres://real")
    expect(env.DATABASE_URL).toBe("postgres://real")
  })

  it("treats an unset NODE_ENV as production, not development", () => {
    // A hand-started worker (systemd, cron, `npm run worker`) has no NODE_ENV.
    // Falling back to the dev database there would point production at a local
    // scratch DB, or encrypt secrets with the publicly known dev key.
    vi.stubEnv("NODE_ENV", undefined)
    vi.stubEnv("DATABASE_URL", undefined)
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL/)
  })

  it("refuses the .env.example placeholder for secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ENCRYPTION_KEY", "change-me")
    expect(() => env.ENCRYPTION_KEY).toThrow(/placeholder/)
    vi.stubEnv("BETTER_AUTH_SECRET", "  Change-Me  ")
    expect(() => env.BETTER_AUTH_SECRET).toThrow(/placeholder/)
  })

  it("accepts a real secret and only warns when it is short", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ENCRYPTION_KEY", "short-but-real")
    expect(env.ENCRYPTION_KEY).toBe("short-but-real")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
