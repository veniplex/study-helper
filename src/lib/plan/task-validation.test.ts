import { describe, expect, it } from "vitest"
import { dueDateField, maxDueIso } from "./task-validation"

describe("dueDateField — due date clamp (B1)", () => {
  it("accepts a near-future date", () => {
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    expect(dueDateField.safeParse(soon).success).toBe(true)
  })

  it("rejects a far-future date beyond ~3 years", () => {
    expect(dueDateField.safeParse("9999-12-31").success).toBe(false)
  })

  it("accepts a date just under the 3-year cap and rejects one just over", () => {
    const now = new Date()
    const cap = maxDueIso(now)
    const overCap = new Date(now.getTime() + (3 * 365 + 5) * 86400000).toISOString().slice(0, 10)
    expect(dueDateField.safeParse(cap).success).toBe(true)
    expect(dueDateField.safeParse(overCap).success).toBe(false)
  })

  it("still rejects malformed date strings", () => {
    expect(dueDateField.safeParse("not-a-date").success).toBe(false)
  })
})
