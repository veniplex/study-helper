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

// ---- Goal CRUD --------------------------------------------------------------

const goalTypeEnum = z.enum([
  "exam",
  "assignments",
  "term_paper",
  "presentation",
  "oral_exam",
  "project",
  "thesis",
  "other",
])
const gradingRoleEnum = z.enum(["grade", "bonus", "practice"])
const bonusTypeEnum = z.enum(["none", "percent_points", "grade_steps"])

const goalConfigSchema = z
  .object({
    expectedCount: z.number().int().min(0).max(1000).optional().nullable(),
    bonus: z
      .object({
        type: bonusTypeEnum,
        value: z.number().min(0).max(1000).optional(),
        minAvgPercent: z.number().min(0).max(100).optional(),
        minCompletedShare: z.number().min(0).max(1).optional(),
      })
      .optional(),
    variant: z.enum(["scientific", "task"]).optional(),
    taskDescription: z.string().max(5000).optional(),
    requiresSources: z.boolean().optional(),
    withPresentation: z.boolean().optional(),
    durationMinutes: z.number().int().min(0).max(100000).optional(),
  })
  .default({})

const goalSchema = z.object({
  type: goalTypeEnum,
  title: z.string().max(200).optional().nullable(),
  gradingRole: gradingRoleEnum.default("grade"),
  weight: z.number().min(0).max(1000).default(1),
  maxAttempts: z.number().int().min(1).max(20).default(3),
  passFail: z.boolean().default(false),
  dueDate: z.string().date().optional().nullable(),
  config: goalConfigSchema,
})

/** Splits parsed goal input into module_goal columns (numeric → string). */
function goalValues(data: z.infer<typeof goalSchema>) {
  return {
    type: data.type,
    title: data.title ?? null,
    gradingRole: data.gradingRole,
    weight: String(data.weight),
    maxAttempts: data.maxAttempts,
    passFail: data.passFail,
    dueDate: data.dueDate ?? null,
    config: data.config,
  }
}

/** Resolves a goal to its owning module/program (throws if not owned). */
async function ownGoal(goalId: string, userId: string) {
  const row = await db.query.moduleGoal.findFirst({
    where: eq(moduleGoal.id, goalId),
    with: { module: { with: { semester: { with: { program: true } } } } },
  })
  if (!row || row.module.semester.program.userId !== userId) {
    throw new Error("Not found")
  }
  return row
}

export async function createGoal(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = goalSchema.parse(input)
  const existing = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
    columns: { sortOrder: true },
  })
  const nextOrder = existing.reduce((max, g) => Math.max(max, g.sortOrder), -1) + 1
  const [created] = await db
    .insert(moduleGoal)
    .values({ ...goalValues(data), moduleId, sortOrder: nextOrder })
    .returning({ id: moduleGoal.id })
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  return { ok: true as const, id: created.id }
}

export async function updateGoal(goalId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownGoal(goalId, session.user.id)
  const data = goalSchema.parse(input)
  await db.update(moduleGoal).set(goalValues(data)).where(eq(moduleGoal.id, goalId))
  revalidatePath(`/studies/${row.module.semester.programId}/${row.moduleId}`)
  return { ok: true as const }
}

export async function deleteGoal(goalId: string) {
  const session = await requireSession()
  const row = await ownGoal(goalId, session.user.id)
  await db.delete(moduleGoal).where(eq(moduleGoal.id, goalId))
  revalidatePath(`/studies/${row.module.semester.programId}/${row.moduleId}`)
  return { ok: true as const }
}

export async function reorderGoals(moduleId: string, orderedIds: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const ids = z.array(z.string()).max(100).parse(orderedIds)
  const goals = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
    columns: { id: true },
  })
  const owned = new Set(goals.map((g) => g.id))
  if (ids.length !== goals.length || ids.some((id) => !owned.has(id))) {
    throw new Error("Not found")
  }
  await Promise.all(
    ids.map((id, i) => db.update(moduleGoal).set({ sortOrder: i }).where(eq(moduleGoal.id, id)))
  )
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  return { ok: true as const }
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

export async function addAttempt(goalId: string, input: unknown) {
  const session = await requireSession()
  const goal = await ownGoal(goalId, session.user.id)
  const data = attemptSchema.parse(input)

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
  revalidatePath(`/studies/${goal.module.semester.programId}/${goal.moduleId}`)
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
