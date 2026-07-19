/**
 * Exam-goal readiness (pure, testable).
 *
 * Compares the study time a goal still needs (`remainingMinutes`, from its
 * open tasks) against the study capacity available before the exam
 * (`capacityMinutes`, from the weekly windows minus absences). Returns a
 * traffic-light state used by the goal card.
 */

export type Readiness = "on_track" | "at_risk" | "unreachable"

/**
 * Traffic light for an exam goal:
 * - `on_track`    remaining ≤ 0.8 × capacity (or nothing left to do)
 * - `at_risk`     remaining ≤ capacity
 * - `unreachable` remaining > capacity (or no capacity at all)
 */
export function computeReadiness({
  remainingMinutes,
  capacityMinutes,
}: {
  remainingMinutes: number
  capacityMinutes: number
}): Readiness {
  if (remainingMinutes <= 0) return "on_track"
  if (capacityMinutes <= 0) return "unreachable"
  if (remainingMinutes <= 0.8 * capacityMinutes) return "on_track"
  if (remainingMinutes <= capacityMinutes) return "at_risk"
  return "unreachable"
}

/** Minutes between two "HH:mm" times (never negative). */
export function windowMinutes(from: string, to: string): number {
  const [fh, fm] = from.split(":").map(Number)
  const [th, tm] = to.split(":").map(Number)
  return Math.max(0, th * 60 + tm - (fh * 60 + fm))
}

const MS_PER_DAY = 86_400_000
const parseDay = (date: string) => Date.parse(`${date}T00:00:00Z`)

/**
 * Sums the available study minutes from `today` (inclusive) up to but NOT
 * including `examDate` (no session lands on the exam day). For each day it adds
 * that weekday's window minutes and subtracts blocked windows: an all-day block
 * (`from == null`) zeroes the day, a timed block subtracts its own length
 * (clamped, approximate — overlaps are not intersected). Capped at 400 days.
 */
export function capacityMinutes({
  today,
  examDate,
  weekly,
  blocked,
}: {
  today: string
  examDate: string
  weekly: { weekday: number; from: string; to: string }[]
  blocked: { date: string; from: string | null; to: string | null }[]
}): number {
  if (examDate <= today) return 0

  const byWeekday = new Map<number, number>()
  for (const w of weekly) {
    byWeekday.set(w.weekday, (byWeekday.get(w.weekday) ?? 0) + windowMinutes(w.from, w.to))
  }

  const allDayOff = new Set<string>()
  const timedOff = new Map<string, number>()
  for (const b of blocked) {
    if (b.from == null || b.to == null) allDayOff.add(b.date)
    else timedOff.set(b.date, (timedOff.get(b.date) ?? 0) + windowMinutes(b.from, b.to))
  }

  let total = 0
  const start = parseDay(today)
  const end = parseDay(examDate)
  const maxDays = 400
  for (let i = 0, ms = start; ms < end && i < maxDays; i++, ms += MS_PER_DAY) {
    const date = new Date(ms).toISOString().slice(0, 10)
    if (allDayOff.has(date)) continue
    const weekday = new Date(ms).getUTCDay()
    const dayMinutes = byWeekday.get(weekday) ?? 0
    if (dayMinutes === 0) continue
    total += Math.max(0, dayMinutes - (timedOff.get(date) ?? 0))
  }
  return total
}
