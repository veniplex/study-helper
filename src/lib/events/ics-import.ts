import type { EventRecurrence } from "@/db/schema"

export type ImportedEvent = {
  uid: string | null
  title: string
  startsAt: Date
  endsAt: Date | null
  location: string | null
  notes: string | null
  allDay: boolean
  recurrence: EventRecurrence
  recurrenceUntil: string | null
  recurrenceWeekdays: number[] | null
  recurrenceInterval: number | null
}

/** Unfolds RFC-5545 continuation lines (CRLF followed by space/tab). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

/**
 * Parses an ICS datetime. UTC ("...Z") converts to local; TZID/floating values
 * are taken as wall-clock time (good enough for personal calendars); VALUE=DATE
 * becomes local midnight (all-day).
 */
function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (dateOnly) {
    return { date: new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00`), allDay: true }
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value)
  if (!dt) return null
  const iso = `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6] ?? "00"}`
  const date = dt[7] ? new Date(`${iso}Z`) : new Date(iso)
  return Number.isNaN(date.getTime()) ? null : { date, allDay: false }
}

type ParsedRrule = {
  recurrence: EventRecurrence
  until: string | null
  weekdays: number[] | null
  interval: number | null
}

const BYDAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function parseRrule(value: string): ParsedRrule {
  const none: ParsedRrule = { recurrence: "none", until: null, weekdays: null, interval: null }
  const parts = new Map(
    value.split(";").map((p) => {
      const idx = p.indexOf("=")
      return [p.slice(0, idx).toUpperCase(), p.slice(idx + 1)] as const
    })
  )
  if (parts.get("FREQ")?.toUpperCase() !== "WEEKLY") return none
  const interval = Math.min(Math.max(Number(parts.get("INTERVAL") ?? "1") || 1, 1), 4)
  const untilRaw = parts.get("UNTIL")
  const until = untilRaw ? (parseIcsDate(untilRaw)?.date ?? null) : null
  const pad = (n: number) => String(n).padStart(2, "0")
  const untilIso = until
    ? `${until.getFullYear()}-${pad(until.getMonth() + 1)}-${pad(until.getDate())}`
    : null
  // Simple ordinals only — "1MO"-style prefixed BYDAY entries are ignored.
  const weekdays =
    parts
      .get("BYDAY")
      ?.split(",")
      .map((d) => BYDAY_MAP[d.trim().toUpperCase()])
      .filter((d) => d != null) ?? []

  if (weekdays.length > 1 || (weekdays.length === 1 && interval > 2)) {
    return { recurrence: "custom", until: untilIso, weekdays, interval }
  }
  return {
    recurrence: interval === 2 ? "biweekly" : "weekly",
    until: untilIso,
    weekdays: null,
    interval: null,
  }
}

/**
 * Parses VEVENTs out of an ICS file. Unsupported recurrence rules (daily,
 * monthly, BYDAY lists …) import as the first occurrence only. Returns at most
 * `limit` events.
 */
export function parseIcs(text: string, limit = 500): ImportedEvent[] {
  const lines = unfold(text)
  const events: ImportedEvent[] = []
  let cur: Record<string, string> | null = null

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      cur = {}
      continue
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (cur) {
        const ev = toEvent(cur)
        if (ev) events.push(ev)
        if (events.length >= limit) break
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(":")
    if (idx < 1) continue
    const rawName = line.slice(0, idx)
    // idx >= 1, so rawName is non-empty and split yields at least one part.
    const name = (rawName.split(";")[0] ?? rawName).toUpperCase()
    // first wins — ignores overridden recurrence instances (RECURRENCE-ID)
    if (!(name in cur)) cur[name] = line.slice(idx + 1)
  }
  return events
}

function toEvent(fields: Record<string, string>): ImportedEvent | null {
  const start = fields.DTSTART ? parseIcsDate(fields.DTSTART.trim()) : null
  const summary = fields.SUMMARY ? unescapeText(fields.SUMMARY).trim() : ""
  if (!start || !summary) return null
  const end = fields.DTEND ? parseIcsDate(fields.DTEND.trim()) : null
  const rrule: ParsedRrule = fields.RRULE
    ? parseRrule(fields.RRULE)
    : { recurrence: "none", until: null, weekdays: null, interval: null }
  return {
    uid: fields.UID?.trim() || null,
    title: summary.slice(0, 300),
    startsAt: start.date,
    // ICS all-day DTEND is exclusive; drop it so single-day events stay single-day.
    endsAt: end && !start.allDay ? end.date : null,
    location: fields.LOCATION ? unescapeText(fields.LOCATION).slice(0, 300) : null,
    notes: fields.DESCRIPTION ? unescapeText(fields.DESCRIPTION).slice(0, 2000) : null,
    allDay: start.allDay,
    recurrence: rrule.recurrence,
    recurrenceUntil: rrule.until,
    recurrenceWeekdays: rrule.weekdays,
    recurrenceInterval: rrule.interval,
  }
}
