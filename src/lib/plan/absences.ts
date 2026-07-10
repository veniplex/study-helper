import { CronExpressionParser } from "cron-parser"
import type { PlanAvailability } from "@/db/schema"

export type AbsenceWindow = {
  /** ISO date */
  date: string
  /** "HH:mm" or null for all-day (vacation ranges) */
  from: string | null
  to: string | null
  label: string | null
}

function toDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  const total = h * 60 + m + minutes
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
}

/**
 * Expands an availability's blackouts and recurring commitments into concrete
 * unavailability windows between `from` and `to` (inclusive). Used both for
 * calendar display and for grounding the AI plan generation.
 */
export function expandAbsences(
  availability: PlanAvailability,
  from: Date,
  to: Date
): AbsenceWindow[] {
  const windows: AbsenceWindow[] = []

  // One-off date ranges (vacations) — all-day per day
  for (const b of availability.blackouts ?? []) {
    const start = new Date(b.from)
    const end = new Date(b.to)
    for (let d = new Date(Math.max(start.getTime(), from.getTime())); d <= end && d <= to; d.setDate(d.getDate() + 1)) {
      windows.push({ date: toDayKey(d), from: null, to: null, label: b.label ?? null })
    }
  }

  for (const r of availability.recurring ?? []) {
    if (r.cron) {
      // Cron mode: each occurrence blocks [occurrence, +durationMinutes]
      try {
        const interval = CronExpressionParser.parse(r.cron, {
          currentDate: from,
          endDate: to,
        })
        let guard = 0
        while (guard++ < 1000) {
          const next = interval.next()
          const d = next.toDate()
          if (d > to) break
          const pad = (n: number) => String(n).padStart(2, "0")
          const start = `${pad(d.getHours())}:${pad(d.getMinutes())}`
          windows.push({
            date: toDayKey(d),
            from: start,
            to: addMinutes(start, r.durationMinutes ?? 60),
            label: r.label ?? null,
          })
        }
      } catch {
        // invalid cron or iteration exhausted — skip entry
      }
    } else {
      // Simple mode: weekday + time window, weekly or biweekly (anchored)
      const anchor = r.anchor ? new Date(r.anchor) : null
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== r.weekday) continue
        if (r.interval === 2) {
          const ref = anchor ?? from
          const weeks = Math.round((d.getTime() - ref.getTime()) / (7 * 24 * 60 * 60 * 1000))
          if (((weeks % 2) + 2) % 2 !== 0) continue
        }
        windows.push({ date: toDayKey(d), from: r.from, to: r.to, label: r.label ?? null })
      }
    }
  }

  return windows
}

/** Validates a cron expression (5-field). Returns an error string or null. */
export function validateCron(expr: string): string | null {
  try {
    CronExpressionParser.parse(expr)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
