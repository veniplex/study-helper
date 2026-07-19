"use server"

import { revalidatePath } from "next/cache"
import { and, eq, gte, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { modulePlan, planSession, planTask, semesterPlan, studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownSemester } from "@/lib/studies/access"
import { expandAbsences } from "@/lib/plan/absences"
import { expandOccurrences, toIsoDate } from "@/lib/events/recurrence"
import {
  computeSchedule,
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleInput,
  type ScheduleModuleInput,
} from "@/lib/plan/scheduler"

const pad = (n: number) => String(n).padStart(2, "0")
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * Recomputes the semester's study sessions from today forward with the
 * deterministic scheduler, then replaces future non-pinned, non-done sessions
 * in a transaction. Past sessions, pinned sessions and done sessions are kept
 * (and fed to the scheduler as fixed blockers). Returns the scheduler warnings.
 */
export async function recomputeSchedule(semesterId: string) {
  const session = await requireSession()
  await ownSemester(semesterId, session.user.id)

  const plan = await db.query.semesterPlan.findFirst({
    where: eq(semesterPlan.semesterId, semesterId),
  })
  if (!plan) throw new Error("No availability configured")

  const modules = await db.query.studyModule.findMany({
    where: (m, { eq: e }) => e(m.semesterId, semesterId),
    columns: { id: true },
  })
  const moduleIds = modules.map((m) => m.id)
  if (moduleIds.length === 0) return { ok: true as const, warnings: [] }

  const [plans, openTasks] = await Promise.all([
    db.query.modulePlan.findMany({ where: inArray(modulePlan.moduleId, moduleIds) }),
    db.query.planTask.findMany({
      where: and(inArray(planTask.moduleId, moduleIds), eq(planTask.done, false)),
      orderBy: (t, { asc }) => [asc(t.sortOrder)],
      columns: { id: true, moduleId: true, estimatedMinutes: true, dueDate: true },
    }),
  ])

  const tasksByModule = new Map<string, ScheduleModuleInput["tasks"]>()
  for (const t of openTasks) {
    const list = tasksByModule.get(t.moduleId) ?? []
    list.push({ id: t.id, estimatedMinutes: t.estimatedMinutes, dueDate: t.dueDate })
    tasksByModule.set(t.moduleId, list)
  }

  const scheduleModules: ScheduleModuleInput[] = plans
    .filter((p) => p.active)
    .map((p) => ({
      moduleId: p.moduleId,
      weight: Number(p.weight) || 1,
      weeklyHoursTarget: p.weeklyHoursTarget == null ? null : Number(p.weeklyHoursTarget),
      phase: p.phase,
      preferredWeekdays: p.preferredWeekdays ?? null,
      tasks: tasksByModule.get(p.moduleId) ?? [],
    }))
    .filter((m) => m.tasks.length > 0)

  // Horizon: at least 6 weeks, extended to the last task deadline if further,
  // but hard-capped at today+365d so a far-future due date can't blow up the
  // scheduling window (DoS via distant deadlines). Tasks beyond the cap are
  // simply clipped here.
  const now = new Date()
  const today = toIsoDate(now)
  const sixWeeks = new Date(now)
  sixWeeks.setDate(sixWeeks.getDate() + 42)
  const cap = toIsoDate(new Date(now.getTime() + 365 * 86400000))
  let horizonEnd = toIsoDate(sixWeeks)
  for (const t of openTasks) if (t.dueDate && t.dueDate > horizonEnd) horizonEnd = t.dueDate
  if (horizonEnd > cap) horizonEnd = cap
  const horizonDate = new Date(`${horizonEnd}T23:59:59`)

  // Absences (blackouts + recurring) → all-day / windowed blockers.
  const blockedWindows = expandAbsences(plan.availability, now, horizonDate).map((w) => ({
    date: w.date,
    from: w.from,
    to: w.to,
  }))

  // Existing calendar events (expanded for recurrence) as busy blockers.
  const events = await db.query.studyEvent.findMany({
    where: eq(studyEvent.userId, session.user.id),
    columns: {
      startsAt: true,
      endsAt: true,
      allDay: true,
      recurrence: true,
      recurrenceUntil: true,
      recurrenceWeekdays: true,
      recurrenceInterval: true,
    },
  })
  const busyEvents: ScheduleInput["busyEvents"] = []
  for (const e of events) {
    const occ = expandOccurrences(e, now, horizonDate)
    for (const o of occ) {
      if (e.allDay) {
        blockedWindows.push({ date: o.occurrenceDate, from: null, to: null })
      } else {
        const end = o.endsAt ?? new Date(o.startsAt.getTime() + 60 * 60000)
        busyEvents.push({ date: o.occurrenceDate, from: hhmm(o.startsAt), to: hhmm(end) })
      }
    }
  }

  // Pinned / done future sessions are kept and treated as fixed blockers.
  const keptSessions = await db.query.planSession.findMany({
    where: and(eq(planSession.semesterPlanId, plan.id), gte(planSession.date, today)),
    columns: { id: true, date: true, startTime: true, durationMinutes: true, pinned: true, done: true },
  })
  const pinnedSessions = keptSessions
    .filter((s) => s.pinned || s.done)
    .map((s) => ({ date: s.date, startTime: s.startTime, durationMinutes: s.durationMinutes }))

  const cfg = {
    maxSessionsPerDay: plan.config?.maxSessionsPerDay ?? DEFAULT_SCHEDULE_CONFIG.maxSessionsPerDay,
    sessionMinutes: plan.config?.sessionMinutes ?? DEFAULT_SCHEDULE_CONFIG.sessionMinutes,
  }

  const input: ScheduleInput = {
    today,
    horizonEnd,
    availabilityWindows: plan.availability.weekly ?? [],
    blockedWindows,
    busyEvents,
    config: cfg,
    pinnedSessions,
    modules: scheduleModules,
  }

  const result = computeSchedule(input)

  await db.transaction(async (tx) => {
    await tx
      .delete(planSession)
      .where(
        and(
          eq(planSession.semesterPlanId, plan.id),
          gte(planSession.date, today),
          eq(planSession.pinned, false),
          eq(planSession.done, false)
        )
      )
    for (const s of result.sessions) {
      const [created] = await tx
        .insert(planSession)
        .values({
          semesterPlanId: plan.id,
          moduleId: s.moduleId,
          date: s.date,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
        })
        .returning({ id: planSession.id })
      if (s.taskIds.length > 0) {
        await tx
          .update(planTask)
          .set({ sessionId: created.id })
          .where(inArray(planTask.id, s.taskIds))
      }
    }
  })

  await db.update(semesterPlan).set({ generatedAt: new Date() }).where(eq(semesterPlan.id, plan.id))
  revalidatePath("/", "layout")
  return { ok: true as const, warnings: result.warnings, sessions: result.sessions.length }
}

/** Alias of {@link recomputeSchedule}; the scheduler always anchors at today. */
export async function replanFromToday(semesterId: string) {
  return recomputeSchedule(semesterId)
}

// ---- single-session edits ---------------------------------------------------

/** Loads a plan session (with its semester plan for ownership) or throws. */
async function ownSession(sessionId: string, userId: string) {
  const row = await db.query.planSession.findFirst({
    where: eq(planSession.id, sessionId),
    with: { semesterPlan: true },
  })
  if (!row || row.semesterPlan.userId !== userId) throw new Error("Not found")
  return row
}

const moveSchema = z.object({
  date: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(5).max(600),
})

/** Moves/resizes a session and pins it so the scheduler leaves it alone. */
export async function moveSession(sessionId: string, input: unknown) {
  const session = await requireSession()
  await ownSession(sessionId, session.user.id)
  const data = moveSchema.parse(input)
  await db
    .update(planSession)
    .set({ date: data.date, startTime: data.startTime, durationMinutes: data.durationMinutes, pinned: true })
    .where(eq(planSession.id, sessionId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function toggleSession(sessionId: string, done: boolean) {
  const session = await requireSession()
  await ownSession(sessionId, session.user.id)
  await db.update(planSession).set({ done }).where(eq(planSession.id, sessionId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}
