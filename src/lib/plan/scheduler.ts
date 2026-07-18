/**
 * Deterministic study-plan scheduler.
 *
 * Pure module: no DB, no `Date.now()`, no randomness. Given availability,
 * blockers and each active module's open tasks, it greedily lays out
 * collision-free study sessions (calendar blocks) from `today` to `horizonEnd`.
 *
 * This is intentionally a pragmatic greedy planner, NOT an optimizer:
 *   1. Walk days chronologically.
 *   2. Per day, compute free slots = availability(weekday) − blocked − busy − pinned.
 *   3. Cut free slots into [min,max]-minute session slots, ≤ maxSessionsPerDay/day.
 *   4. Assign each slot to one module (deadline-first, else weighted round-robin
 *      within the lowest active phase; preferredWeekdays as a soft filter).
 *   5. Pack that module's open tasks into the session until full.
 *
 * Determinism: no randomness; every tie breaks by (phase asc, weight desc,
 * moduleId asc). Same input ⇒ byte-identical output.
 */

export type ScheduleModuleInput = {
  moduleId: string
  weight: number
  /** Optional weekly minute budget cap (hours × 60). null = uncapped. */
  weeklyHoursTarget: number | null
  /** Ordering group: lower phases are scheduled before higher ones. */
  phase: number
  /** Soft weekday filter (0=Sun..6=Sat). null = any weekday. */
  preferredWeekdays: number[] | null
  /** Open tasks in priority order. */
  tasks: { id: string; estimatedMinutes: number; dueDate: string | null }[]
}

export type ScheduleInput = {
  /** ISO date (YYYY-MM-DD) — first day considered. */
  today: string
  /** ISO date — last day considered (inclusive). */
  horizonEnd: string
  availabilityWindows: { weekday: number; from: string; to: string }[]
  /** from=null blocks the whole day (vacation); else the [from,to) window. */
  blockedWindows: { date: string; from: string | null; to: string | null }[]
  busyEvents: { date: string; from: string; to: string }[]
  config: { maxSessionsPerDay: number; sessionMinutes: { min: number; max: number } }
  /** Fixed blocks the scheduler plans around (kept as-is, not re-emitted). */
  pinnedSessions: { date: string; startTime: string; durationMinutes: number }[]
  modules: ScheduleModuleInput[]
}

export type ScheduledSession = {
  moduleId: string
  date: string
  startTime: string
  durationMinutes: number
  taskIds: string[]
}

export type ScheduleWarning = {
  kind: "deadline_unreachable" | "no_capacity"
  moduleId?: string
  taskId?: string
  message?: string
}

export type ScheduleResult = {
  sessions: ScheduledSession[]
  warnings: ScheduleWarning[]
}

// ---- time / date helpers (pure) ------------------------------------------------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function toHHmm(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** UTC-based so it never depends on the host timezone or the clock. */
function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function weekdayOf(date: string): number {
  return new Date(parseDay(date)).getUTCDay()
}

function addDays(date: string, n: number): string {
  return new Date(parseDay(date) + n * 86400000).toISOString().slice(0, 10)
}

/** ISO-8601 week key ("YYYY-Www"), used to cap weeklyHoursTarget per week. */
function isoWeekKey(date: string): string {
  const d = new Date(parseDay(date))
  // Thursday of the current ISO week determines the year + week number.
  const day = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = Date.UTC(d.getUTCFullYear(), 0, 4)
  const ft = new Date(firstThursday)
  const ftDay = (ft.getUTCDay() + 6) % 7
  ft.setUTCDate(ft.getUTCDate() - ftDay + 3)
  const week = 1 + Math.round((d.getTime() - ft.getTime()) / (7 * 86400000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

// ---- interval algebra (minutes within a day) -----------------------------------

type Interval = { start: number; end: number }

function normalize(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

/** base − blockers (both as minute intervals within one day). */
function subtract(base: Interval[], blockers: Interval[]): Interval[] {
  const blocks = normalize(blockers)
  let current = normalize(base)
  for (const b of blocks) {
    const next: Interval[] = []
    for (const iv of current) {
      if (b.end <= iv.start || b.start >= iv.end) {
        next.push(iv) // no overlap
        continue
      }
      if (b.start > iv.start) next.push({ start: iv.start, end: b.start })
      if (b.end < iv.end) next.push({ start: b.end, end: iv.end })
    }
    current = next
  }
  return current
}

// ---- module scheduling state ---------------------------------------------------

type ModuleState = {
  input: ScheduleModuleInput
  queue: { id: string; estimatedMinutes: number; dueDate: string | null }[]
  assignedMinutes: number
  weekMinutes: Map<string, number>
}

function earliestDue(state: ModuleState): string | null {
  let best: string | null = null
  for (const t of state.queue) {
    if (t.dueDate && (best === null || t.dueDate < best)) best = t.dueDate
  }
  return best
}

/** Deterministic ordering: phase asc, weight desc, moduleId asc. */
function tieBreak(a: ModuleState, b: ModuleState): number {
  if (a.input.phase !== b.input.phase) return a.input.phase - b.input.phase
  if (a.input.weight !== b.input.weight) return b.input.weight - a.input.weight
  return a.input.moduleId < b.input.moduleId ? -1 : a.input.moduleId > b.input.moduleId ? 1 : 0
}

// ---- main ----------------------------------------------------------------------

export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const { config } = input
  const { min, max } = config.sessionMinutes
  const sessions: ScheduledSession[] = []
  const warnings: ScheduleWarning[] = []

  const states: ModuleState[] = input.modules.map((m) => ({
    input: m,
    queue: m.tasks.map((t) => ({ ...t })),
    assignedMinutes: 0,
    weekMinutes: new Map(),
  }))

  // Group inputs by day for O(1) lookup during the walk.
  const availByWeekday = new Map<number, Interval[]>()
  for (const w of input.availabilityWindows) {
    const list = availByWeekday.get(w.weekday) ?? []
    list.push({ start: toMinutes(w.from), end: toMinutes(w.to) })
    availByWeekday.set(w.weekday, list)
  }
  const blockedByDate = new Map<string, { whole: boolean; ivs: Interval[] }>()
  for (const b of input.blockedWindows) {
    const entry = blockedByDate.get(b.date) ?? { whole: false, ivs: [] }
    if (b.from === null) entry.whole = true
    else entry.ivs.push({ start: toMinutes(b.from), end: toMinutes(b.to ?? "24:00") })
    blockedByDate.set(b.date, entry)
  }
  const busyByDate = new Map<string, Interval[]>()
  for (const e of input.busyEvents) {
    const list = busyByDate.get(e.date) ?? []
    list.push({ start: toMinutes(e.from), end: toMinutes(e.to) })
    busyByDate.set(e.date, list)
  }
  const pinnedByDate = new Map<string, Interval[]>()
  const pinnedCountByDate = new Map<string, number>()
  for (const p of input.pinnedSessions) {
    const list = pinnedByDate.get(p.date) ?? []
    list.push({ start: toMinutes(p.startTime), end: toMinutes(p.startTime) + p.durationMinutes })
    pinnedByDate.set(p.date, list)
    pinnedCountByDate.set(p.date, (pinnedCountByDate.get(p.date) ?? 0) + 1)
  }

  // Records where each task landed (for deadline warnings).
  const placedOn = new Map<string, string>()

  for (let date = input.today; date <= input.horizonEnd; date = addDays(date, 1)) {
    if (states.every((s) => s.queue.length === 0)) break

    const blocked = blockedByDate.get(date)
    if (blocked?.whole) continue

    const weekday = weekdayOf(date)
    const avail = availByWeekday.get(weekday)
    if (!avail || avail.length === 0) continue

    const blockers: Interval[] = [
      ...(blocked?.ivs ?? []),
      ...(busyByDate.get(date) ?? []),
      ...(pinnedByDate.get(date) ?? []),
    ]
    const free = subtract(avail, blockers)
    if (free.length === 0) continue

    // Cut the free intervals into session-sized slots (chronological).
    const slots: Interval[] = []
    for (const iv of free) {
      let cursor = iv.start
      while (iv.end - cursor >= min) {
        let size = Math.min(max, iv.end - cursor)
        const leftover = iv.end - cursor - size
        // Absorb a sub-`min` sliver into this slot rather than orphaning it.
        if (leftover > 0 && leftover < min && size + leftover <= max) size += leftover
        slots.push({ start: cursor, end: cursor + size })
        cursor += size
      }
    }

    const budget = Math.max(0, config.maxSessionsPerDay - (pinnedCountByDate.get(date) ?? 0))
    const weekKey = isoWeekKey(date)

    for (const slot of slots.slice(0, budget)) {
      const chosen = selectModule(states, date, weekday, weekKey, min)
      if (!chosen) continue

      const slotCap = slot.end - slot.start
      const cap = capacityFor(chosen, weekKey, slotCap, min)
      if (cap < min) continue

      // Pack tasks until the capacity is used (always at least one task).
      const taskIds: string[] = []
      let used = 0
      while (chosen.queue.length > 0) {
        const t = chosen.queue[0]
        if (taskIds.length > 0 && used + t.estimatedMinutes > cap) break
        taskIds.push(t.id)
        used += t.estimatedMinutes
        placedOn.set(t.id, date)
        chosen.queue.shift()
      }

      const durationMinutes = Math.max(min, Math.min(used, cap))
      sessions.push({
        moduleId: chosen.input.moduleId,
        date,
        startTime: toHHmm(slot.start),
        durationMinutes,
        taskIds,
      })
      chosen.assignedMinutes += durationMinutes
      chosen.weekMinutes.set(weekKey, (chosen.weekMinutes.get(weekKey) ?? 0) + durationMinutes)
    }
  }

  // ---- warnings ----
  for (const s of states) {
    const unplacedDeadline = s.queue.filter((t) => t.dueDate)
    for (const t of unplacedDeadline) {
      warnings.push({
        kind: "deadline_unreachable",
        moduleId: s.input.moduleId,
        taskId: t.id,
        message: `Task ${t.id} could not be scheduled before its due date ${t.dueDate}.`,
      })
    }
    // Placed but landing after the deadline.
    for (const t of s.input.tasks) {
      const on = placedOn.get(t.id)
      if (t.dueDate && on && on > t.dueDate) {
        warnings.push({
          kind: "deadline_unreachable",
          moduleId: s.input.moduleId,
          taskId: t.id,
          message: `Task ${t.id} is scheduled on ${on}, after its due date ${t.dueDate}.`,
        })
      }
    }
    const unplacedOther = s.queue.some((t) => !t.dueDate)
    if (unplacedOther) {
      warnings.push({
        kind: "no_capacity",
        moduleId: s.input.moduleId,
        message: `Not enough capacity to schedule all tasks for module ${s.input.moduleId} within the horizon.`,
      })
    }
  }

  return { sessions, warnings }
}

/** Remaining capacity for a module in a slot: min(slot, weekBudget, remainingWork). */
function capacityFor(state: ModuleState, weekKey: string, slotCap: number, min: number): number {
  const remainingWork = state.queue.reduce((sum, t) => sum + t.estimatedMinutes, 0)
  let cap = Math.min(slotCap, Math.max(remainingWork, min))
  const target = state.input.weeklyHoursTarget
  if (target != null) {
    const used = state.weekMinutes.get(weekKey) ?? 0
    cap = Math.min(cap, target * 60 - used)
  }
  return cap
}

/**
 * Picks the module that should own the next session slot.
 *
 * A module with any remaining deadline task is eligible regardless of phase or
 * weekday and wins by earliest due date (deadlines cross phases and are
 * front-loaded so they land in time). Otherwise only modules in the lowest
 * active phase whose weekday preference matches are eligible, and the "most
 * behind its weighted share" (min assignedMinutes/weight) module wins.
 */
function selectModule(
  states: ModuleState[],
  date: string,
  weekday: number,
  weekKey: string,
  min: number
): ModuleState | null {
  const withWork = states.filter((s) => s.queue.length > 0 && hasWeekCapacity(s, weekKey, min))
  if (withWork.length === 0) return null

  const activePhase = Math.min(...withWork.map((s) => s.input.phase))

  // Deadline-driven modules cross phase and weekday boundaries.
  const deadline = withWork.filter((s) => earliestDue(s) !== null)
  if (deadline.length > 0) {
    return [...deadline].sort((a, b) => {
      const da = earliestDue(a)!
      const db = earliestDue(b)!
      if (da !== db) return da < db ? -1 : 1
      return tieBreak(a, b)
    })[0]
  }

  // Non-deadline: lowest active phase, weekday preference respected.
  const eligible = withWork.filter((s) => {
    if (s.input.phase !== activePhase) return false
    const pref = s.input.preferredWeekdays
    return pref == null || pref.includes(weekday)
  })
  if (eligible.length === 0) return null

  return [...eligible].sort((a, b) => {
    const shareA = a.assignedMinutes / a.input.weight
    const shareB = b.assignedMinutes / b.input.weight
    if (shareA !== shareB) return shareA - shareB
    return tieBreak(a, b)
  })[0]
}

function hasWeekCapacity(state: ModuleState, weekKey: string, min: number): boolean {
  const target = state.input.weeklyHoursTarget
  if (target == null) return true
  const used = state.weekMinutes.get(weekKey) ?? 0
  return target * 60 - used >= min
}

/** Default scheduler config when a semester plan has none. */
export const DEFAULT_SCHEDULE_CONFIG = {
  maxSessionsPerDay: 2,
  sessionMinutes: { min: 45, max: 180 },
} as const
