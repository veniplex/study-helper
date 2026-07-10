import { describe, expect, it } from "vitest"
import { scheduleReview, type CardSchedulingFields } from "./fsrs"

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
