import { describe, expect, it, vi } from "vitest"
import { isNetworkError, isRetryable } from "./outbox"

describe("isNetworkError", () => {
  it("matches fetch-shaped network failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isNetworkError(new TypeError("fetch failed"))).toBe(true)
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(true)
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true)
  })

  it("does not classify ordinary client bugs as offline", () => {
    expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false)
    expect(isNetworkError(new Error("Not found"))).toBe(false)
    expect(isNetworkError("boom")).toBe(false)
  })

  it("treats an offline browser as a network error regardless of message", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    expect(isNetworkError(new Error("anything"))).toBe(true)
    spy.mockRestore()
  })
})

describe("isRetryable", () => {
  /** Shape of the error a server action rejects with after redirect("/login"). */
  function redirectError(digest = "NEXT_REDIRECT;push;/login;307;") {
    return Object.assign(new Error("NEXT_REDIRECT"), { digest })
  }

  it("keeps entries queued when the session expired mid-replay", () => {
    // Regression: an expired session redirects to /login, which is not a
    // network error — treating it as permanent discarded every queued review.
    expect(isRetryable(redirectError())).toBe(true)
    expect(isNetworkError(redirectError())).toBe(false)
  })

  it("covers network failures too", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true)
  })

  it("does not retry genuinely permanent failures", () => {
    expect(isRetryable(new Error("ERR:GENERIC"))).toBe(false)
    expect(isRetryable(new Error("Not found"))).toBe(false)
    expect(isRetryable(Object.assign(new Error("x"), { digest: 12345 }))).toBe(false)
    expect(isRetryable(null)).toBe(false)
  })
})
