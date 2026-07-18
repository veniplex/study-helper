import { describe, expect, it } from "vitest"
import { shouldUseTus, TUS_THRESHOLD } from "./upload-transport"

describe("shouldUseTus", () => {
  it("uses tus for files at or above the threshold when supported", () => {
    expect(shouldUseTus(TUS_THRESHOLD, true)).toBe(true)
    expect(shouldUseTus(TUS_THRESHOLD + 1, true)).toBe(true)
  })

  it("keeps small files on the direct path", () => {
    expect(shouldUseTus(TUS_THRESHOLD - 1, true)).toBe(false)
    expect(shouldUseTus(0, true)).toBe(false)
  })

  it("never uses tus when the browser can't support it", () => {
    expect(shouldUseTus(TUS_THRESHOLD * 4, false)).toBe(false)
  })
})
