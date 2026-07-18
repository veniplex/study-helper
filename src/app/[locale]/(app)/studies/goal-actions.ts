"use server"

import { revalidatePath } from "next/cache"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { goalAttempt, moduleGoal } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

const attemptSchema = z.object({
  resultPercent: z.number().min(0).max(100).optional().nullable(),
  date: z.string().date().optional().nullable(),
  passed: z.boolean().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
})

/**
 * Ensures the module has a grade goal to attach attempts to, returning it.
 * Falls back to creating a default exam goal for older modules without one.
 * (Full goal CRUD / picking a specific goal arrives in a later phase.)
 */
async function ensureGradeGoal(moduleId: string) {
  const existing = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
    orderBy: [asc(moduleGoal.sortOrder), asc(moduleGoal.createdAt)],
  })
  const gradeGoal = existing.find((g) => g.gradingRole === "grade") ?? existing[0]
  if (gradeGoal) return gradeGoal
  const [created] = await db
    .insert(moduleGoal)
    .values({ moduleId, type: "exam", gradingRole: "grade" })
    .returning()
  return created
}

/** Resolves an attempt to its owning module (throws if not owned). */
async function ownAttempt(attemptId: string, userId: string) {
  const row = await db.query.goalAttempt.findFirst({
    where: eq(goalAttempt.id, attemptId),
    with: {
      goal: {
        with: { module: { with: { semester: { with: { program: true } } } } },
      },
    },
  })
  if (!row || row.goal.module.semester.program.userId !== userId) {
    throw new Error("Not found")
  }
  return row
}

export async function addAttempt(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = attemptSchema.parse(input)
  const goal = await ensureGradeGoal(moduleId)

  const existing = await db.query.goalAttempt.findMany({
    where: eq(goalAttempt.goalId, goal.id),
    orderBy: [asc(goalAttempt.attempt)],
    columns: { attempt: true },
  })
  if (existing.length >= goal.maxAttempts) {
    throw new Error("Maximale Versuchszahl erreicht")
  }
  const nextAttempt = existing.reduce((max, a) => Math.max(max, a.attempt), 0) + 1

  await db.insert(goalAttempt).values({
    goalId: goal.id,
    attempt: nextAttempt,
    resultPercent: data.resultPercent != null ? String(data.resultPercent) : null,
    date: data.date ?? null,
    passed: data.passed ?? null,
    note: data.note ?? null,
  })
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  return { ok: true as const }
}

export async function updateAttempt(attemptId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownAttempt(attemptId, session.user.id)
  const data = attemptSchema.parse(input)
  await db
    .update(goalAttempt)
    .set({
      resultPercent: data.resultPercent != null ? String(data.resultPercent) : null,
      date: data.date ?? null,
      passed: data.passed ?? null,
      note: data.note ?? null,
    })
    .where(eq(goalAttempt.id, attemptId))
  const programId = row.goal.module.semester.programId
  revalidatePath(`/studies/${programId}/${row.goal.moduleId}`)
  return { ok: true as const }
}

export async function deleteAttempt(attemptId: string) {
  const session = await requireSession()
  const row = await ownAttempt(attemptId, session.user.id)
  await db.delete(goalAttempt).where(eq(goalAttempt.id, attemptId))
  const programId = row.goal.module.semester.programId
  revalidatePath(`/studies/${programId}/${row.goal.moduleId}`)
  return { ok: true as const }
}
