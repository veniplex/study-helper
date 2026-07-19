"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { semesterPlan, type PlanAvailability } from "@/db/schema"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { validateCron } from "@/lib/plan/absences"
import { markPlanStale } from "@/lib/plan/staleness"
import { ownSemester } from "@/lib/studies/access"
import { recomputeSchedule } from "./schedule-actions"

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const availabilitySchema = z.object({
  weekly: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          from: z.string().regex(HHMM),
          to: z.string().regex(HHMM),
        })
        .refine((w) => w.from < w.to, { message: "from must be before to" })
    )
    .max(21),
  blackouts: z
    .array(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        label: z.string().max(100).optional(),
      })
    )
    .max(30),
  recurring: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
          from: z.string().regex(HHMM),
          to: z.string().regex(HHMM),
          interval: z.union([z.literal(1), z.literal(2)]),
          anchor: z.string().date().optional(),
          label: z.string().max(100).optional(),
          cron: z
            .string()
            .max(100)
            .optional()
            .refine((v) => v == null || v === "" || validateCron(v) == null, {
              message: "Invalid cron expression",
            }),
          durationMinutes: z
            .number()
            .int()
            .min(5)
            .max(24 * 60)
            .optional(),
        })
        .refine((r) => r.from < r.to, { message: "from must be before to" })
    )
    .max(20)
    .optional(),
})

export async function saveAvailability(semesterId: string, input: unknown) {
  const session = await requireSession()
  await ownSemester(semesterId, session.user.id)
  const availability = availabilitySchema.parse(input) as PlanAvailability
  await db
    .insert(semesterPlan)
    .values({ userId: session.user.id, semesterId, availability })
    .onConflictDoUpdate({ target: semesterPlan.semesterId, set: { availability } })
  // Availability is a core scheduler input → auto-replan (best-effort).
  try {
    await recomputeSchedule(semesterId)
  } catch {
    // best-effort; availability was saved regardless
  }
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const isoWeekSchema = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/)

/**
 * A9: sets ("this week I only have Nh") or clears (`hours == null`) a per-ISO-week
 * study-hour cap on the semester plan. Marks the plan stale so the UI offers a
 * recompute; the scheduler applies the cap on the next recompute.
 */
export async function saveWeekOverride(
  semesterId: string,
  isoWeek: string,
  hours: number | null
) {
  const session = await requireSession()
  await ownSemester(semesterId, session.user.id)
  const week = isoWeekSchema.parse(isoWeek)
  const value = hours == null ? null : z.number().min(0).max(168).parse(hours)

  const plan = await db.query.semesterPlan.findFirst({
    where: eq(semesterPlan.semesterId, semesterId),
    columns: { id: true, weekOverrides: true },
  })
  if (!plan) actionError("PLAN_NO_AVAILABILITY")

  const next = { ...(plan.weekOverrides ?? {}) }
  if (value == null) delete next[week]
  else next[week] = value

  await db
    .update(semesterPlan)
    .set({ weekOverrides: next })
    .where(eq(semesterPlan.id, plan.id))
  await markPlanStale(semesterId)
  revalidatePath("/", "layout")
  return { ok: true as const }
}
