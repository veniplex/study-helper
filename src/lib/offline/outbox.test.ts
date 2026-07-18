import { describe, expect, it, vi } from "vitest"
import { isNetworkError } from "./outbox"

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
