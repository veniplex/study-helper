import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { checkRateLimit, clientIp, resetRateLimits } from "./rate-limit"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetRateLimits()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to max requests inside the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", 5, 60_000)).toBe(true)
    }
    expect(checkRateLimit("k", 5, 60_000)).toBe(false)
  })

  it("resets after the window elapses", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000)
    expect(checkRateLimit("k", 5, 60_000)).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(checkRateLimit("k", 5, 60_000)).toBe(true)
  })

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000)
    expect(checkRateLimit("a", 5, 60_000)).toBe(false)
    expect(checkRateLimit("b", 5, 60_000)).toBe(true)
  })
})

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const request = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    })
    expect(clientIp(request)).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe(
      "5.6.7.8"
    )
    expect(clientIp(new Request("http://x"))).toBe("unknown")
  })
})
