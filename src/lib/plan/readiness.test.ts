import { describe, expect, it } from "vitest"
import { capacityMinutes, computeReadiness, windowMinutes } from "./readiness"

describe("computeReadiness", () => {
  it("is on_track when nothing remains", () => {
    expect(computeReadiness({ remainingMinutes: 0, capacityMinutes: 0 })).toBe("on_track")
    expect(computeReadiness({ remainingMinutes: -10, capacityMinutes: 100 })).toBe("on_track")
  })

  it("is on_track at or below 0.8× capacity", () => {
    expect(computeReadiness({ remainingMinutes: 80, capacityMinutes: 100 })).toBe("on_track")
    expect(computeReadiness({ remainingMinutes: 50, capacityMinutes: 100 })).toBe("on_track")
  })

  it("is at_risk between 0.8× and 1× capacity", () => {
    expect(computeReadiness({ remainingMinutes: 90, capacityMinutes: 100 })).toBe("at_risk")
    expect(computeReadiness({ remainingMinutes: 100, capacityMinutes: 100 })).toBe("at_risk")
  })

  it("is unreachable above capacity", () => {
    expect(computeReadiness({ remainingMinutes: 101, capacityMinutes: 100 })).toBe("unreachable")
  })

  it("is unreachable when there is work but no capacity", () => {
    expect(computeReadiness({ remainingMinutes: 10, capacityMinutes: 0 })).toBe("unreachable")
  })
})

describe("windowMinutes", () => {
  it("computes duration and never goes negative", () => {
    expect(windowMinutes("18:00", "20:00")).toBe(120)
    expect(windowMinutes("09:30", "10:00")).toBe(30)
    expect(windowMinutes("20:00", "18:00")).toBe(0)
  })
})

describe("capacityMinutes", () => {
  it("returns 0 when the exam is not in the future", () => {
    expect(
      capacityMinutes({
        today: "2026-07-19",
        examDate: "2026-07-19",
        weekly: [{ weekday: 0, from: "09:00", to: "17:00" }],
        blocked: [],
      })
    ).toBe(0)
  })

  it("sums weekday windows up to (excluding) the exam day", () => {
    // 2026-07-19 is a Sunday. Window on every day 18:00–20:00 (120 min).
    // Days counted: Sun 19 .. Wed 22 (exam on Thu 23) → 4 days × 120 = 480.
    const weekly = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      from: "18:00",
      to: "20:00",
    }))
    expect(
      capacityMinutes({ today: "2026-07-19", examDate: "2026-07-23", weekly, blocked: [] })
    ).toBe(480)
  })

  it("subtracts all-day and timed blocks", () => {
    const weekly = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      from: "18:00",
      to: "20:00",
    }))
    // 4 days × 120 = 480, minus an all-day off (−120) and a 30-min timed block.
    const blocked = [
      { date: "2026-07-20", from: null, to: null },
      { date: "2026-07-21", from: "18:00", to: "18:30" },
    ]
    expect(
      capacityMinutes({ today: "2026-07-19", examDate: "2026-07-23", weekly, blocked })
    ).toBe(480 - 120 - 30)
  })
})
