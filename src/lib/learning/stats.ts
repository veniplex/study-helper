/**
 * Learning-statistics helpers (pure — see stats.test.ts).
 * Activity = flashcard reviews, finished quiz attempts, logged study sessions.
 */

export type HeatmapCell = { date: string; count: number }

/** Format a Date as local ISO day (YYYY-MM-DD). */
export function toDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const date = new Date(y, m - 1, d + delta)
  return toDayKey(date)
}

/**
 * Current streak in days: consecutive active days ending today or yesterday
 * (a streak survives until a full day was missed).
 */
export function computeStreak(activeDays: Iterable<string>, today: string): number {
  const set = new Set(activeDays)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Heatmap grid for the last `weeks` weeks ending today, oldest first.
 * Cells outside the activity map get count 0.
 */
export function buildHeatmap(
  counts: ReadonlyMap<string, number>,
  today: string,
  weeks = 26
): HeatmapCell[] {
  const days = weeks * 7
  const cells: HeatmapCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    cells.push({ date, count: counts.get(date) ?? 0 })
  }
  return cells
}

/** Merge per-source day counts into one map. */
export function mergeDayCounts(...sources: ReadonlyMap<string, number>[]): Map<string, number> {
  const merged = new Map<string, number>()
  for (const source of sources) {
    for (const [day, count] of source) {
      merged.set(day, (merged.get(day) ?? 0) + count)
    }
  }
  return merged
}

/** Count occurrences per local day. */
export function countByDay(dates: Iterable<Date>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const d of dates) {
    const key = toDayKey(d)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Sum of minutes for sessions started within the last 7 days (inclusive today). */
export function minutesLast7Days(
  sessions: readonly { startedAt: Date; durationMinutes: number }[],
  today: string
): number {
  const from = addDays(today, -6)
  return sessions
    .filter((s) => {
      const day = toDayKey(s.startedAt)
      return day >= from && day <= today
    })
    .reduce((sum, s) => sum + s.durationMinutes, 0)
}
