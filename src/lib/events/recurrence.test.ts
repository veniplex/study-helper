import { describe, expect, it } from "vitest"
import { expandOccurrences, nextOccurrence } from "./recurrence"

const base = {
  startsAt: new Date("2026-04-13T10:00:00"),
  endsAt: new Date("2026-04-13T11:30:00"),
  recurrenceUntil: null as string | null,
}

describe("expandOccurrences", () => {
  it("returns a single occurrence for non-recurring events", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "none" },
      new Date("2026-04-01"),
      new Date("2026-04-30")
    )
    expect(occ).toHaveLength(1)
    expect(occ[0]!.isRecurrenceInstance).toBe(false)
  })

  it("omits non-recurring events outside the window", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "none" },
      new Date("2026-05-01"),
      new Date("2026-05-31")
    )
    expect(occ).toHaveLength(0)
  })

  it("expands weekly occurrences until the window end", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "weekly" },
      new Date("2026-04-01"),
      new Date("2026-05-05")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual([
      "2026-04-13",
      "2026-04-20",
      "2026-04-27",
      "2026-05-04",
    ])
    expect(occ[0]!.isRecurrenceInstance).toBe(false)
    expect(occ[1]!.isRecurrenceInstance).toBe(true)
  })

  it("respects recurrenceUntil inclusively", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "weekly", recurrenceUntil: "2026-04-27" },
      new Date("2026-04-01"),
      new Date("2026-06-30")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-20", "2026-04-27"])
  })

  it("expands biweekly and skips periods before the window", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "biweekly" },
      new Date("2026-06-01"),
      new Date("2026-06-30")
    )
    // series: 13.4, 27.4, 11.5, 25.5, 8.6, 22.6
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-06-08", "2026-06-22"])
  })

  it("keeps event duration on every occurrence", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "weekly" },
      new Date("2026-04-19"),
      new Date("2026-04-21")
    )
    expect(occ).toHaveLength(1)
    expect(occ[0]!.endsAt!.getTime() - occ[0]!.startsAt.getTime()).toBe(90 * 60 * 1000)
  })

  it("skips individually-deleted occurrences via skipDates (E18)", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "weekly", skipDates: ["2026-04-20", "2026-05-04"] },
      new Date("2026-04-01"),
      new Date("2026-05-05")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-27"])
  })

  it("leaves the series intact when skipDates is empty or null", () => {
    const empty = expandOccurrences(
      { ...base, recurrence: "weekly", skipDates: [] },
      new Date("2026-04-01"),
      new Date("2026-04-28")
    )
    expect(empty.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-20", "2026-04-27"])
  })

  it("can skip the first (non-instance) occurrence too", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "weekly", skipDates: ["2026-04-13"] },
      new Date("2026-04-01"),
      new Date("2026-04-28")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-20", "2026-04-27"])
  })
})

describe("custom recurrence", () => {
  it("expands multiple weekdays per week", () => {
    // 2026-04-13 is a Monday
    const occ = expandOccurrences(
      { ...base, recurrence: "custom", recurrenceWeekdays: [1, 4], recurrenceInterval: 1 },
      new Date("2026-04-13"),
      new Date("2026-04-26")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual([
      "2026-04-13",
      "2026-04-16",
      "2026-04-20",
      "2026-04-23",
    ])
    expect(occ.every((o, i) => i === 0 || o.isRecurrenceInstance)).toBe(true)
    expect(occ[1]!.startsAt.getHours()).toBe(10)
  })

  it("honors the week interval anchored at the start week", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "custom", recurrenceWeekdays: [1], recurrenceInterval: 2 },
      new Date("2026-04-13"),
      new Date("2026-05-12")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-27", "2026-05-11"])
  })

  it("falls back to the start weekday when none are given", () => {
    const occ = expandOccurrences(
      { ...base, recurrence: "custom", recurrenceWeekdays: [], recurrenceInterval: 1 },
      new Date("2026-04-13"),
      new Date("2026-04-21")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-20"])
  })

  it("respects recurrenceUntil", () => {
    const occ = expandOccurrences(
      {
        ...base,
        recurrence: "custom",
        recurrenceWeekdays: [1, 4],
        recurrenceInterval: 1,
        recurrenceUntil: "2026-04-16",
      },
      new Date("2026-04-13"),
      new Date("2026-05-31")
    )
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-04-13", "2026-04-16"])
  })
})

describe("nextOccurrence", () => {
  it("finds the next weekly occurrence", () => {
    const occ = nextOccurrence({ ...base, recurrence: "weekly" }, new Date("2026-05-01T00:00:00"))
    expect(occ?.occurrenceDate).toBe("2026-05-04")
  })

  it("returns null after the series ended", () => {
    const occ = nextOccurrence(
      { ...base, recurrence: "weekly", recurrenceUntil: "2026-04-20" },
      new Date("2026-05-01T00:00:00")
    )
    expect(occ).toBeNull()
  })
})
