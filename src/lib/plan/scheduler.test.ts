import { describe, expect, it } from "vitest"
import {
  computeSchedule,
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleInput,
  type ScheduleModuleInput,
} from "./scheduler"

// ---- helpers -------------------------------------------------------------------

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? NaN) * 60 + (m ?? NaN)
}
const endMin = (s: { startTime: string; durationMinutes: number }) =>
  toMin(s.startTime) + s.durationMinutes
const weekday = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay()
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

/** Availability window on every weekday. */
function allDays(from: string, to: string) {
  return [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, from, to }))
}

function baseInput(over: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    today: "2026-08-03", // Monday
    horizonEnd: "2026-08-16",
    availabilityWindows: allDays("09:00", "12:00"),
    blockedWindows: [],
    busyEvents: [],
    config: { maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 180 } },
    pinnedSessions: [],
    modules: [],
    ...over,
  }
}

function mod(over: Partial<ScheduleModuleInput> & { moduleId: string }): ScheduleModuleInput {
  return {
    weight: 1,
    weeklyHoursTarget: null,
    phase: 1,
    preferredWeekdays: null,
    tasks: [],
    ...over,
  }
}

function tasks(n: number, minutes = 60, dueDate: string | null = null) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    estimatedMinutes: minutes,
    dueDate,
  }))
}

// ---- (a) availability ----------------------------------------------------------

describe("computeSchedule — availability", () => {
  it("(a) never schedules outside availability windows", () => {
    const input = baseInput({
      availabilityWindows: [1, 2, 3, 4, 5].map((w) => ({ weekday: w, from: "09:00", to: "12:00" })),
      modules: [mod({ moduleId: "m", tasks: tasks(20) })],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      const wd = weekday(s.date)
      expect([1, 2, 3, 4, 5]).toContain(wd)
      expect(toMin(s.startTime)).toBeGreaterThanOrEqual(toMin("09:00"))
      expect(endMin(s)).toBeLessThanOrEqual(toMin("12:00"))
    }
  })
})

// ---- (b) blockers --------------------------------------------------------------

describe("computeSchedule — blockers", () => {
  it("(b) no session overlaps a blockedWindow, busyEvent or pinnedSession", () => {
    const day = "2026-08-03"
    const input = baseInput({
      today: day,
      horizonEnd: day,
      availabilityWindows: allDays("09:00", "17:00"),
      config: { maxSessionsPerDay: 6, sessionMinutes: { min: 45, max: 90 } },
      busyEvents: [{ date: day, from: "10:00", to: "11:00" }],
      blockedWindows: [{ date: day, from: "13:00", to: "14:00" }],
      pinnedSessions: [{ date: day, startTime: "15:00", durationMinutes: 30 }],
      modules: [mod({ moduleId: "m", tasks: tasks(10, 45) })],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    const blockers: [number, number][] = [
      [toMin("10:00"), toMin("11:00")],
      [toMin("13:00"), toMin("14:00")],
      [toMin("15:00"), toMin("15:30")],
    ]
    for (const s of sessions) {
      for (const [bS, bE] of blockers) {
        expect(overlaps(toMin(s.startTime), endMin(s), bS, bE)).toBe(false)
      }
    }
  })

  it("(b2) a whole-day blackout leaves the day empty", () => {
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-03",
      blockedWindows: [{ date: "2026-08-03", from: null, to: null }],
      modules: [mod({ moduleId: "m", tasks: tasks(5) })],
    })
    expect(computeSchedule(input).sessions).toHaveLength(0)
  })
})

// ---- (c) maxSessionsPerDay ------------------------------------------------------

describe("computeSchedule — daily cap", () => {
  it("(c) respects maxSessionsPerDay", () => {
    const input = baseInput({
      availabilityWindows: allDays("08:00", "20:00"),
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 90 } },
      modules: [mod({ moduleId: "m", tasks: tasks(40, 60) })],
    })
    const { sessions } = computeSchedule(input)
    const byDate = new Map<string, number>()
    for (const s of sessions) byDate.set(s.date, (byDate.get(s.date) ?? 0) + 1)
    for (const count of byDate.values()) expect(count).toBeLessThanOrEqual(1)
    expect([...byDate.values()].some((c) => c === 1)).toBe(true)
  })

  it("(c2) pinned sessions count against the daily cap", () => {
    const day = "2026-08-03"
    const input = baseInput({
      today: day,
      horizonEnd: day,
      availabilityWindows: allDays("08:00", "20:00"),
      config: { maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 90 } },
      pinnedSessions: [{ date: day, startTime: "08:00", durationMinutes: 60 }],
      modules: [mod({ moduleId: "m", tasks: tasks(10, 60) })],
    })
    const { sessions } = computeSchedule(input)
    // 2 max − 1 pinned = at most 1 generated session that day.
    expect(sessions.filter((s) => s.date === day).length).toBeLessThanOrEqual(1)
  })
})

// ---- (d) durations -------------------------------------------------------------

describe("computeSchedule — durations", () => {
  it("(d) every session duration is within [min,max]", () => {
    const input = baseInput({
      availabilityWindows: allDays("09:00", "18:00"),
      config: { maxSessionsPerDay: 3, sessionMinutes: { min: 45, max: 120 } },
      modules: [
        mod({ moduleId: "a", tasks: tasks(10, 30) }), // small tasks → padded up to min
        mod({ moduleId: "b", tasks: tasks(10, 200) }), // big tasks → capped at max
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      expect(s.durationMinutes).toBeGreaterThanOrEqual(45)
      expect(s.durationMinutes).toBeLessThanOrEqual(120)
    }
  })
})

// ---- (e)/(f) deadlines ---------------------------------------------------------

describe("computeSchedule — deadlines", () => {
  it("(e) a deadline task lands on/before its due date when capacity allows", () => {
    const due = "2026-08-10"
    const input = baseInput({
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [mod({ moduleId: "m", tasks: [{ id: "exam", estimatedMinutes: 120, dueDate: due }] })],
    })
    const { sessions, warnings } = computeSchedule(input)
    const placed = sessions.find((s) => s.taskIds.includes("exam"))
    expect(placed).toBeDefined()
    expect(placed!.date <= due).toBe(true)
    expect(warnings.some((w) => w.kind === "deadline_unreachable")).toBe(false)
  })

  it("(f) emits deadline_unreachable when capacity is insufficient", () => {
    // No availability on the due date's weekday before it passes → the task
    // can only be placed after the deadline.
    const today = "2026-08-03" // Monday
    const due = today // due today, but today's weekday has no availability
    const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((w) => w !== weekday(today))
    const input = baseInput({
      today,
      horizonEnd: "2026-08-16",
      availabilityWindows: otherDays.map((w) => ({ weekday: w, from: "09:00", to: "12:00" })),
      modules: [mod({ moduleId: "m", tasks: [{ id: "late", estimatedMinutes: 60, dueDate: due }] })],
    })
    const { warnings } = computeSchedule(input)
    expect(warnings.some((w) => w.kind === "deadline_unreachable" && w.taskId === "late")).toBe(true)
  })
})

// ---- (g) sequential phases -----------------------------------------------------

describe("computeSchedule — phases", () => {
  it("(g) a phase-2 module gets nothing while a phase-1 module still has tasks", () => {
    // Phase-1 module has far more work than the horizon can absorb.
    const input = baseInput({
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 180 } },
      modules: [
        mod({ moduleId: "p1", phase: 1, tasks: tasks(100, 180) }),
        mod({ moduleId: "p2", phase: 2, tasks: tasks(5, 180) }),
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.some((s) => s.moduleId === "p1")).toBe(true)
    expect(sessions.some((s) => s.moduleId === "p2")).toBe(false)
  })

  it("(g2) phase-2 becomes eligible once phase-1 tasks are exhausted", () => {
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 180 } },
      modules: [
        mod({ moduleId: "p1", phase: 1, tasks: tasks(2, 180) }),
        mod({ moduleId: "p2", phase: 2, tasks: tasks(2, 180) }),
      ],
    })
    const { sessions } = computeSchedule(input)
    const p1Dates = sessions.filter((s) => s.moduleId === "p1").map((s) => s.date)
    const p2Dates = sessions.filter((s) => s.moduleId === "p2").map((s) => s.date)
    expect(p1Dates.length).toBe(2)
    expect(p2Dates.length).toBe(2)
    // No phase-2 session starts before the last phase-1 session.
    expect(Math.min(...p2Dates.map((d) => Date.parse(d)))).toBeGreaterThan(
      Math.max(...p1Dates.map((d) => Date.parse(d)))
    )
  })
})

// ---- (h) weights ---------------------------------------------------------------

describe("computeSchedule — weights", () => {
  it("(h) time share is approximately proportional to weight", () => {
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-10-31",
      availabilityWindows: allDays("09:00", "10:00"), // one 60-min slot/day
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 60 } },
      modules: [
        mod({ moduleId: "light", weight: 1, tasks: tasks(200, 60) }),
        mod({ moduleId: "heavy", weight: 3, tasks: tasks(200, 60) }),
      ],
    })
    const { sessions } = computeSchedule(input)
    const minutes = (id: string) =>
      sessions.filter((s) => s.moduleId === id).reduce((sum, s) => sum + s.durationMinutes, 0)
    const ratio = minutes("heavy") / minutes("light")
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(3.5)
  })
})

// ---- (i) determinism -----------------------------------------------------------

describe("computeSchedule — determinism", () => {
  it("(i) identical input yields identical output", () => {
    const build = () =>
      baseInput({
        today: "2026-08-03",
        horizonEnd: "2026-09-15",
        availabilityWindows: allDays("09:00", "15:00"),
        config: { maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 120 } },
        busyEvents: [{ date: "2026-08-05", from: "10:00", to: "12:00" }],
        modules: [
          mod({ moduleId: "a", weight: 2, tasks: tasks(30, 90) }),
          mod({ moduleId: "b", weight: 1, phase: 2, tasks: tasks(30, 60) }),
          mod({
            moduleId: "c",
            tasks: [{ id: "c-deadline", estimatedMinutes: 120, dueDate: "2026-08-20" }],
          }),
        ],
      })
    const first = computeSchedule(build())
    const second = computeSchedule(build())
    expect(second).toEqual(first)
  })
})

// ---- (j) preferred weekdays ----------------------------------------------------

describe("computeSchedule — preferred weekdays", () => {
  it("(j) honors preferredWeekdays when capacity allows", () => {
    const monday = 1
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 180 } },
      modules: [
        mod({ moduleId: "m", preferredWeekdays: [monday], tasks: tasks(3, 120) }),
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) expect(weekday(s.date)).toBe(monday)
  })
})

// ---- weekly hours target -------------------------------------------------------

describe("computeSchedule — weeklyHoursTarget", () => {
  it("caps a module's minutes per ISO week", () => {
    const input = baseInput({
      today: "2026-08-03", // Monday — full ISO week ahead
      horizonEnd: "2026-08-09", // through Sunday: exactly one ISO week
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 180 } },
      modules: [mod({ moduleId: "m", weeklyHoursTarget: 2, tasks: tasks(20, 60) })],
    })
    const { sessions } = computeSchedule(input)
    const total = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
    expect(total).toBeLessThanOrEqual(120) // 2h weekly cap
  })
})

describe("DEFAULT_SCHEDULE_CONFIG", () => {
  it("matches the documented defaults", () => {
    expect(DEFAULT_SCHEDULE_CONFIG).toEqual({
      maxSessionsPerDay: 2,
      sessionMinutes: { min: 45, max: 180 },
    })
  })
})

// ---- consolidation window ------------------------------------------------------

/** Categorized task helper for consolidation tests. */
function ctask(
  id: string,
  category: "learn" | "review" | "cards",
  minutes = 60,
  dueDate: string | null = null
) {
  return { id, estimatedMinutes: minutes, dueDate, category }
}

/** ISO-week key mirroring the scheduler's internal grouping. */
function weekKeyOf(date: string): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`))
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = Date.UTC(d.getUTCFullYear(), 0, 4)
  const ft = new Date(firstThursday)
  const ftDay = (ft.getUTCDay() + 6) % 7
  ft.setUTCDate(ft.getUTCDate() - ftDay + 3)
  const week = 1 + Math.round((d.getTime() - ft.getTime()) / (7 * 86400000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

describe("computeSchedule — consolidation window", () => {
  const START = "2026-08-17"
  const END = "2026-08-24" // exam day
  const consolidation = { start: START, end: END }

  it("(a) never places a learn task on/after the window start", () => {
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [
        mod({
          moduleId: "m",
          consolidation,
          tasks: [0, 1, 2, 3].map((i) => ctask(`learn${i}`, "learn", 60, START)),
        }),
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) expect(s.date < START).toBe(true)
  })

  it("(b) review/cards tasks land inside the window", () => {
    const input = baseInput({
      today: START,
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [
        mod({
          moduleId: "m",
          consolidation,
          tasks: [
            ctask("r0", "review", 60, "2026-08-20"),
            ctask("c0", "cards", 30, "2026-08-20"),
            ctask("r1", "review", 60, "2026-08-22"),
          ],
        }),
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) {
      expect(s.date >= START && s.date <= END).toBe(true)
      expect(s.date).not.toBe(END)
    }
  })

  it("(c) an assignment learn task due INSIDE the window is still scheduled", () => {
    const input = baseInput({
      today: START,
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [
        mod({
          moduleId: "m",
          consolidation,
          tasks: [ctask("assign", "learn", 60, "2026-08-20")],
        }),
      ],
    })
    const { sessions, warnings } = computeSchedule(input)
    const placed = sessions.find((s) => s.taskIds.includes("assign"))
    expect(placed).toBeDefined()
    expect(placed!.date <= "2026-08-20").toBe(true)
    expect(warnings.some((w) => w.kind === "deadline_unreachable" && w.taskId === "assign")).toBe(
      false
    )
  })

  it("(d) never places a session for the module on the exam day", () => {
    const input = baseInput({
      today: START,
      horizonEnd: "2026-08-31",
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [
        mod({
          moduleId: "m",
          consolidation,
          tasks: [ctask("r0", "review", 60, END), ctask("r1", "review", 60, END)],
        }),
      ],
    })
    const { sessions } = computeSchedule(input)
    expect(sessions.some((s) => s.moduleId === "m")).toBe(true)
    expect(sessions.every((s) => s.date !== END)).toBe(true)
  })

  it("(g) session kind reflects the majority task category", () => {
    const reviewHeavy = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-03",
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 180 } },
      modules: [
        mod({
          moduleId: "m",
          tasks: [ctask("r0", "review", 30), ctask("r1", "review", 30), ctask("l0", "learn", 30)],
        }),
      ],
    })
    const s1 = computeSchedule(reviewHeavy).sessions
    expect(s1).toHaveLength(1)
    expect(s1[0]!.kind).toBe("review") // toHaveLength(1) asserted above

    const learnHeavy = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-03",
      availabilityWindows: allDays("09:00", "12:00"),
      config: { maxSessionsPerDay: 1, sessionMinutes: { min: 45, max: 180 } },
      modules: [mod({ moduleId: "m", tasks: [ctask("l0", "learn", 30), ctask("l1", "learn", 30)] })],
    })
    expect(computeSchedule(learnHeavy).sessions[0]!.kind).toBe("study")
  })
})

// ---- weekly capacity override --------------------------------------------------

describe("computeSchedule — weekCapacityOverrides", () => {
  it("(e) caps the whole plan's minutes in the overridden ISO week only", () => {
    const capWeek = weekKeyOf("2026-08-03")
    const build = () =>
      baseInput({
        today: "2026-08-03", // Monday
        horizonEnd: "2026-08-16", // through the following Sunday (two ISO weeks)
        availabilityWindows: allDays("09:00", "15:00"),
        config: { maxSessionsPerDay: 3, sessionMinutes: { min: 45, max: 60 } },
        weekCapacityOverrides: { [capWeek]: 120 }, // 2h cap in week one
        modules: [mod({ moduleId: "m", tasks: tasks(60, 60) })],
      })
    const { sessions } = computeSchedule(build())
    const minutesIn = (from: string, to: string) =>
      sessions
        .filter((s) => s.date >= from && s.date <= to)
        .reduce((sum, s) => sum + s.durationMinutes, 0)
    expect(minutesIn("2026-08-03", "2026-08-09")).toBeLessThanOrEqual(120)
    // A later week (no override) is unaffected — more than the cap is placed.
    expect(minutesIn("2026-08-10", "2026-08-16")).toBeGreaterThan(120)
    // Determinism preserved.
    expect(computeSchedule(build())).toEqual(computeSchedule(build()))
  })
})

// ---- horizon clipping ----------------------------------------------------------

describe("computeSchedule — horizon_clipped", () => {
  it("(f) emits horizon_clipped for a task due beyond the horizon", () => {
    const input = baseInput({
      today: "2026-08-03",
      horizonEnd: "2026-08-16",
      availabilityWindows: allDays("09:00", "12:00"),
      modules: [
        mod({
          moduleId: "m",
          tasks: [{ id: "far", estimatedMinutes: 60, dueDate: "2027-01-01" }],
        }),
      ],
    })
    const { warnings } = computeSchedule(input)
    expect(warnings.some((w) => w.kind === "horizon_clipped" && w.taskId === "far")).toBe(true)
  })
})

// ---- degenerate config guard (B8) ----------------------------------------------

describe("computeSchedule — degenerate config", () => {
  const degenerateConfigs = [
    { min: 0, max: 0 },
    { min: 0, max: 180 },
    { min: -10, max: -5 },
    { min: 180, max: 45 }, // max < min
    { min: Number.NaN, max: Number.NaN },
  ]

  for (const sessionMinutes of degenerateConfigs) {
    it(`terminates and produces valid sessions for ${JSON.stringify(sessionMinutes)}`, () => {
      const input = baseInput({
        config: { maxSessionsPerDay: 2, sessionMinutes },
        modules: [mod({ moduleId: "m", tasks: tasks(10, 60) })],
      })
      // Must not hang; must still emit only in-availability, sane-length sessions.
      const { sessions } = computeSchedule(input)
      expect(sessions.length).toBeGreaterThan(0)
      for (const s of sessions) {
        expect(s.durationMinutes).toBeGreaterThanOrEqual(5)
        expect(toMin(s.startTime)).toBeGreaterThanOrEqual(toMin("09:00"))
        expect(endMin(s)).toBeLessThanOrEqual(toMin("12:00"))
      }
    })
  }
})
