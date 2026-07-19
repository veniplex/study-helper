import { describe, expect, it } from "vitest"
import {
  formatReviewInterval,
  previewIntervals,
  scheduleReview,
  type CardSchedulingFields,
} from "./fsrs"

const newCard = (): CardSchedulingFields => ({
  due: new Date("2026-07-01T10:00:00Z"),
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  lastReview: null,
})

describe("scheduleReview", () => {
  it("schedules a new card into learning on Again", () => {
    const now = new Date("2026-07-01T10:00:00Z")
    const result = scheduleReview(newCard(), 1, now)
    expect(result.reps).toBe(1)
    expect(result.due.getTime()).toBeGreaterThan(now.getTime())
    expect(result.due.getTime() - now.getTime()).toBeLessThan(60 * 60 * 1000) // < 1h
  })

  it("schedules Good with a longer interval than Again", () => {
    const now = new Date("2026-07-01T10:00:00Z")
    const again = scheduleReview(newCard(), 1, now)
    const good = scheduleReview(newCard(), 3, now)
    expect(good.due.getTime()).toBeGreaterThan(again.due.getTime())
  })

  it("increases stability over successive Good reviews", () => {
    const now = new Date("2026-07-01T10:00:00Z")
    const first = scheduleReview(newCard(), 3, now)
    const second = scheduleReview(first, 3, new Date(first.due.getTime() + 2 * 86_400_000))
    expect(second.stability).toBeGreaterThan(first.stability)
    expect(second.reps).toBe(2)
  })
})

describe("previewIntervals", () => {
  it("returns a monotonic due date per rating without mutating the card", () => {
    const now = new Date("2026-07-01T10:00:00Z")
    const p = previewIntervals(newCard(), now)
    // Again ≤ Hard ≤ Good ≤ Easy in next-due distance.
    expect(p[1].getTime()).toBeLessThanOrEqual(p[2].getTime())
    expect(p[2].getTime()).toBeLessThanOrEqual(p[3].getTime())
    expect(p[3].getTime()).toBeLessThanOrEqual(p[4].getTime())
    // Matches the real schedule for a chosen rating.
    expect(p[3].getTime()).toBe(scheduleReview(newCard(), 3, now).due.getTime())
  })
})

describe("formatReviewInterval", () => {
  const from = new Date("2026-07-01T10:00:00Z")
  it("formats minutes, hours, days and months", () => {
    expect(formatReviewInterval(from, new Date("2026-07-01T10:10:00Z"))).toBe("10m")
    expect(formatReviewInterval(from, new Date("2026-07-01T13:00:00Z"))).toBe("3h")
    expect(formatReviewInterval(from, new Date("2026-07-05T10:00:00Z"))).toBe("4d")
    expect(formatReviewInterval(from, new Date("2026-09-01T10:00:00Z"))).toBe("2mo")
  })
  it("clamps sub-minute gaps", () => {
    expect(formatReviewInterval(from, new Date("2026-07-01T10:00:20Z"))).toBe("<1m")
  })
})
