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
})
