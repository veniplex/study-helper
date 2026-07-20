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

/** What a task (and, in majority, its session) is for. Defaults to "learn". */
export type TaskCategory = "learn" | "review" | "cards"

/** What a scheduled session is for — derived from its majority task category. */
export type SessionKind = "study" | "review" | "cards"

export type ScheduleModuleInput = {
  moduleId: string
  weight: number
  /** Optional weekly minute budget cap (hours × 60). null = uncapped. */
  weeklyHoursTarget: number | null
  /** Ordering group: lower phases are scheduled before higher ones. */
  phase: number
  /** Soft weekday filter (0=Sun..6=Sat). null = any weekday. */
  preferredWeekdays: number[] | null
  /**
   * Pre-exam consolidation window (start = examDate−reviewDays, end = examDate).
   * When set: no `learn` task lands on/after `start` (unless its own dueDate is
   * inside the window), and the module gets no session on `end` (exam day).
   * null/absent = legacy behaviour (window rules off).
   */
  consolidation?: { start: string; end: string } | null
  /** Open tasks in priority order. `category` defaults to "learn". */
  tasks: { id: string; estimatedMinutes: number; dueDate: string | null; category?: TaskCategory }[]
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
  /**
   * Optional per-ISO-week cap (weekKey → minutes) on the WHOLE plan's assigned
   * minutes that week ("this week I only have 4h"). Absent key = no cap.
   */
  weekCapacityOverrides?: Record<string, number>
  modules: ScheduleModuleInput[]
}

export type ScheduledSession = {
  moduleId: string
  date: string
  startTime: string
  durationMinutes: number
  taskIds: string[]
  /** Majority task category of the session (study | review | cards). */
  kind: SessionKind
}

export type ScheduleWarning = {
  kind: "deadline_unreachable" | "no_capacity" | "horizon_clipped"
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
  // "HH:mm" is the stored format; a malformed value still yields NaN as before.
  return (h ?? NaN) * 60 + (m ?? NaN)
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

type QueueTask = {
  id: string
  estimatedMinutes: number
  dueDate: string | null
  category: TaskCategory
}

type ModuleState = {
  input: ScheduleModuleInput
  queue: QueueTask[]
  assignedMinutes: number
  weekMinutes: Map<string, number>
}

/**
 * True if `task` may be placed on `date` for this module. Legacy (no
 * consolidation) → always true. With a window: no session at all on the exam
 * day; `learn` tasks not on/after `start` unless their own dueDate is inside
 * the window; `review`/`cards` unrestricted.
 */
function isPlaceable(state: ModuleState, task: QueueTask, date: string): boolean {
  const c = state.input.consolidation
  if (!c) return true
  if (date === c.end) return false // rule 3: no session on exam day
  if (task.category !== "learn") return true // review/cards placed normally
  if (date < c.start) return true
  // On/after the window start a learn task is only allowed if it is itself due
  // inside the window (e.g. an assignment due during the run-up).
  return task.dueDate != null && task.dueDate >= c.start && task.dueDate <= c.end
}

function hasPlaceableWork(state: ModuleState, date: string): boolean {
  return state.queue.some((t) => isPlaceable(state, t, date))
}

/** Earliest dueDate among the tasks placeable on `date` (null if none). */
function earliestPlaceableDue(state: ModuleState, date: string): string | null {
  let best: string | null = null
  for (const t of state.queue) {
    if (!isPlaceable(state, t, date)) continue
    if (t.dueDate && (best === null || t.dueDate < best)) best = t.dueDate
  }
  return best
}

/** Session kind = majority task category (ties favour study, then review). */
function majorityKind(categories: TaskCategory[]): SessionKind {
  let learn = 0
  let review = 0
  let cards = 0
  for (const c of categories) {
    if (c === "review") review++
    else if (c === "cards") cards++
    else learn++
  }
  if (learn >= review && learn >= cards) return "study"
  if (review >= cards) return "review"
  return "cards"
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
  // Degenerate-config guard: a min<=0 or max<min would make the slot-cutting
  // loop below advance the cursor by 0 and never terminate. Clamp to sane
  // values (min>=5, max>=min), falling back to the defaults when unusable.
  const rawMin = Number(config.sessionMinutes?.min)
  const rawMax = Number(config.sessionMinutes?.max)
  const min =
    Number.isFinite(rawMin) && rawMin >= 5
      ? Math.floor(rawMin)
      : DEFAULT_SCHEDULE_CONFIG.sessionMinutes.min
  const max =
    Number.isFinite(rawMax) && rawMax >= min
      ? Math.floor(rawMax)
      : Math.max(min, DEFAULT_SCHEDULE_CONFIG.sessionMinutes.max)
  const sessions: ScheduledSession[] = []
  const warnings: ScheduleWarning[] = []

  const states: ModuleState[] = input.modules.map((m) => ({
    input: m,
    queue: m.tasks.map((t) => ({ ...t, category: t.category ?? "learn" })),
    assignedMinutes: 0,
    weekMinutes: new Map(),
  }))

  // Plan-wide assigned minutes per ISO week (for weekCapacityOverrides).
  const planWeekMinutes = new Map<string, number>()

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
      let slotGuard = 0
      // Backstop against a non-terminating cut (defensive; min>=5 above already
      // guarantees the cursor advances).
      while (iv.end - cursor >= min && slotGuard++ < 10000) {
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
    const weekOverride = input.weekCapacityOverrides?.[weekKey]

    for (const slot of slots.slice(0, budget)) {
      // Plan-wide weekly cap ("this week only Xh"): stop placing once reached.
      if (weekOverride != null && weekOverride - (planWeekMinutes.get(weekKey) ?? 0) < min) break

      const chosen = selectModule(states, date, weekday, weekKey, min)
      if (!chosen) continue

      const slotCap = slot.end - slot.start
      let cap = capacityFor(chosen, weekKey, slotCap, min)
      if (weekOverride != null) {
        cap = Math.min(cap, weekOverride - (planWeekMinutes.get(weekKey) ?? 0))
      }
      if (cap < min) continue

      // Pack placeable tasks until the capacity is used (always at least one).
      const taskIds: string[] = []
      const categories: TaskCategory[] = []
      let used = 0
      let i = 0
      while (i < chosen.queue.length) {
        const t = chosen.queue[i]! // i < queue.length is the loop condition
        if (!isPlaceable(chosen, t, date)) {
          i++
          continue
        }
        if (taskIds.length > 0 && used + t.estimatedMinutes > cap) break
        taskIds.push(t.id)
        categories.push(t.category)
        used += t.estimatedMinutes
        placedOn.set(t.id, date)
        chosen.queue.splice(i, 1) // remove placed task; do not advance i
      }
      if (taskIds.length === 0) continue

      const durationMinutes = Math.max(min, Math.min(used, cap))
      sessions.push({
        moduleId: chosen.input.moduleId,
        date,
        startTime: toHHmm(slot.start),
        durationMinutes,
        taskIds,
        kind: majorityKind(categories),
      })
      chosen.assignedMinutes += durationMinutes
      chosen.weekMinutes.set(weekKey, (chosen.weekMinutes.get(weekKey) ?? 0) + durationMinutes)
      planWeekMinutes.set(weekKey, (planWeekMinutes.get(weekKey) ?? 0) + durationMinutes)
    }
  }

  // ---- warnings ----
  // A task due beyond the (already-clipped) horizon can never be reached here;
  // surface it so the caller can flag the far-future deadline.
  for (const s of states) {
    for (const t of s.input.tasks) {
      if (t.dueDate && t.dueDate > input.horizonEnd) {
        warnings.push({
          kind: "horizon_clipped",
          moduleId: s.input.moduleId,
          taskId: t.id,
          message: `Task ${t.id} is due ${t.dueDate}, beyond the planning horizon ${input.horizonEnd}.`,
        })
      }
    }
  }
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
  const withWork = states.filter(
    (s) => s.queue.length > 0 && hasWeekCapacity(s, weekKey, min) && hasPlaceableWork(s, date)
  )
  if (withWork.length === 0) return null

  const activePhase = Math.min(...withWork.map((s) => s.input.phase))

  // B10: precompute each module's earliest (placeable) due once per pass rather
  // than recomputing it inside the sort comparator.
  const dueOf = new Map<ModuleState, string | null>()
  for (const s of withWork) dueOf.set(s, earliestPlaceableDue(s, date))

  // Deadline-driven modules cross phase and weekday boundaries.
  const deadline = withWork.filter((s) => dueOf.get(s) != null)
  if (deadline.length > 0) {
    return [...deadline].sort((a, b) => {
      const da = dueOf.get(a)!
      const db = dueOf.get(b)!
      if (da !== db) return da < db ? -1 : 1
      return tieBreak(a, b)
    })[0]! // deadline.length > 0 checked above
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
  })[0]! // eligible.length > 0 checked above
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
