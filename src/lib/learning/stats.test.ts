import { describe, expect, it } from "vitest"
import {
  buildHeatmap,
  computeStreak,
  countByDay,
  mergeDayCounts,
  minutesLast7Days,
  toDayKey,
} from "./stats"

describe("computeStreak", () => {
  it("returns 0 without activity", () => {
    expect(computeStreak([], "2026-07-10")).toBe(0)
  })

  it("counts consecutive days ending today", () => {
    expect(
      computeStreak(["2026-07-08", "2026-07-09", "2026-07-10"], "2026-07-10")
    ).toBe(3)
  })

  it("keeps the streak alive when today has no activity yet", () => {
    expect(computeStreak(["2026-07-08", "2026-07-09"], "2026-07-10")).toBe(2)
  })

  it("breaks on a missed day", () => {
    expect(computeStreak(["2026-07-06", "2026-07-08", "2026-07-10"], "2026-07-10")).toBe(1)
    expect(computeStreak(["2026-07-05", "2026-07-06"], "2026-07-10")).toBe(0)
  })

  it("crosses month boundaries", () => {
    expect(
      computeStreak(["2026-06-29", "2026-06-30", "2026-07-01"], "2026-07-01")
    ).toBe(3)
  })
})

describe("buildHeatmap", () => {
  it("returns weeks*7 cells ending today", () => {
    const cells = buildHeatmap(new Map([["2026-07-10", 3]]), "2026-07-10", 2)
    expect(cells).toHaveLength(14)
    expect(cells.at(-1)).toEqual({ date: "2026-07-10", count: 3 })
    expect(cells[0]!.date).toBe("2026-06-27")
    expect(cells[0]!.count).toBe(0)
  })
})

describe("mergeDayCounts / countByDay", () => {
  it("merges counts per day", () => {
    const merged = mergeDayCounts(
      new Map([["2026-07-10", 2]]),
      new Map([
        ["2026-07-10", 1],
        ["2026-07-09", 4],
      ])
    )
    expect(merged.get("2026-07-10")).toBe(3)
    expect(merged.get("2026-07-09")).toBe(4)
  })

  it("counts dates per local day", () => {
    const counts = countByDay([
      new Date(2026, 6, 10, 9, 0),
      new Date(2026, 6, 10, 22, 0),
      new Date(2026, 6, 9, 1, 0),
    ])
    expect(counts.get("2026-07-10")).toBe(2)
    expect(counts.get("2026-07-09")).toBe(1)
  })
})

describe("minutesLast7Days", () => {
  it("sums only sessions from the last 7 days", () => {
    const total = minutesLast7Days(
      [
        { startedAt: new Date(2026, 6, 10), durationMinutes: 25 },
        { startedAt: new Date(2026, 6, 4), durationMinutes: 25 },
        { startedAt: new Date(2026, 6, 3), durationMinutes: 50 },
      ],
      "2026-07-10"
    )
    expect(total).toBe(50)
  })
})

describe("toDayKey", () => {
  it("formats local dates", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})
