import type { EventRecurrence } from "@/db/schema"

export type RecurringEventLike = {
  startsAt: Date
  endsAt: Date | null
  recurrence: EventRecurrence
  recurrenceUntil: string | null
  /** "custom" only: weekdays 0–6 the event repeats on. */
  recurrenceWeekdays?: number[] | null
  /** "custom" only: repeat every N weeks, anchored at startsAt's week. */
  recurrenceInterval?: number | null
}

export type Occurrence = {
  startsAt: Date
  endsAt: Date | null
  /** ISO date (local) of this occurrence — dedup key for reminders. */
  occurrenceDate: string
  /** True for every expanded instance after the first. */
  isRecurrenceInstance: boolean
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Expands an event into concrete occurrences inside [from, to]. Non-recurring
 * events yield their single occurrence (when it intersects the window).
 * Weekly/biweekly repetition keeps the local start time; the series ends at
 * recurrenceUntil (inclusive, local date) or `to`, whichever comes first.
 */
export function expandOccurrences(
  event: RecurringEventLike,
  from: Date,
  to: Date
): Occurrence[] {
  const duration = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null

  const make = (startsAt: Date, isInstance: boolean): Occurrence => ({
    startsAt,
    endsAt: duration != null ? new Date(startsAt.getTime() + duration) : null,
    occurrenceDate: toIsoDate(startsAt),
    isRecurrenceInstance: isInstance,
  })

  if (event.recurrence === "none" || !event.recurrence) {
    return event.startsAt <= to && (event.endsAt ?? event.startsAt) >= from
      ? [make(event.startsAt, false)]
      : []
  }

  if (event.recurrence === "custom") {
    return expandCustom(event, from, to, make)
  }

  const stepWeeks = event.recurrence === "biweekly" ? 2 : 1
  // recurrenceUntil is a local date; occurrences on that date still count.
  const untilEnd = event.recurrenceUntil
    ? new Date(`${event.recurrenceUntil}T23:59:59.999`)
    : null
  const seriesEnd = untilEnd && untilEnd < to ? untilEnd : to

  const out: Occurrence[] = []
  // Skip whole periods before the window instead of iterating from the start.
  let cursor = new Date(event.startsAt)
  if (cursor < from) {
    const periods = Math.floor((from.getTime() - cursor.getTime()) / (stepWeeks * WEEK_MS))
    cursor = addWeeks(event.startsAt, periods * stepWeeks)
  }
  let guard = 0
  while (cursor <= seriesEnd && guard++ < 1000) {
    if (cursor >= from || (duration != null && cursor.getTime() + duration >= from.getTime())) {
      if (cursor <= seriesEnd) {
        out.push(make(new Date(cursor), cursor.getTime() !== event.startsAt.getTime()))
      }
    }
    cursor = addWeeks(cursor, stepWeeks)
  }
  return out
}

/**
 * "custom" expansion: every listed weekday, every N weeks. Week parity is
 * anchored at the Monday of startsAt's week so all weekdays of one rhythm
 * week land in the same period.
 */
function expandCustom(
  event: RecurringEventLike,
  from: Date,
  to: Date,
  make: (startsAt: Date, isInstance: boolean) => Occurrence
): Occurrence[] {
  const weekdays = new Set(
    (event.recurrenceWeekdays?.length
      ? event.recurrenceWeekdays
      : [event.startsAt.getDay()]
    ).filter((d) => d >= 0 && d <= 6)
  )
  const interval = Math.min(Math.max(event.recurrenceInterval ?? 1, 1), 4)
  const untilEnd = event.recurrenceUntil
    ? new Date(`${event.recurrenceUntil}T23:59:59.999`)
    : null
  const seriesEnd = untilEnd && untilEnd < to ? untilEnd : to

  const anchorMonday = startOfWeek(event.startsAt)
  const start = from > event.startsAt ? from : event.startsAt
  const out: Occurrence[] = []
  const cursor = new Date(start)
  cursor.setHours(event.startsAt.getHours(), event.startsAt.getMinutes(), 0, 0)
  // Walk back one day in case `start`'s time-of-day is past the event time.
  cursor.setDate(cursor.getDate() - 1)
  let guard = 0
  while (cursor <= seriesEnd && guard++ < 2000) {
    cursor.setDate(cursor.getDate() + 1)
    if (cursor < event.startsAt || cursor > seriesEnd || cursor < from) continue
    if (!weekdays.has(cursor.getDay())) continue
    const weeks = Math.round(
      (startOfWeek(cursor).getTime() - anchorMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    if (((weeks % interval) + interval) % interval !== 0) continue
    out.push(make(new Date(cursor), cursor.getTime() !== event.startsAt.getTime()))
  }
  return out
}

/** Local Monday 00:00 of the given date's week. */
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = (out.getDay() + 6) % 7 // Monday = 0
  out.setDate(out.getDate() - day)
  return out
}

/** Adds whole weeks preserving the local wall-clock time across DST changes. */
function addWeeks(base: Date, weeks: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

/** The next occurrence at or after `from`, or null when the series is over. */
export function nextOccurrence(event: RecurringEventLike, from: Date): Occurrence | null {
  const horizon = new Date(from)
  horizon.setFullYear(horizon.getFullYear() + 2)
  const found = expandOccurrences(event, from, horizon)
  return found[0] ?? null
}
