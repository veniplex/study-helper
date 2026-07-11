"use server"

import { revalidatePath } from "next/cache"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { assessmentAttempt, moduleAssessment } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

const ASSESSMENT_TYPES = [
  "exam",
  "term_paper",
  "oral_presentation",
  "oral_exam",
  "project",
  "other",
] as const

const attemptSchema = z.object({
  resultPercent: z.number().min(0).max(100).optional().nullable(),
  date: z.string().date().optional().nullable(),
  passed: z.boolean().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
})

/** Ensures a module has an assessment row, returning its id. */
async function ensureAssessment(moduleId: string): Promise<string> {
  const existing = await db.query.moduleAssessment.findFirst({
    where: eq(moduleAssessment.moduleId, moduleId),
    columns: { id: true },
  })
  if (existing) return existing.id
  const [created] = await db
    .insert(moduleAssessment)
    .values({ moduleId })
    .returning({ id: moduleAssessment.id })
  return created.id
}

/** Resolves an attempt to its owning module (throws if not owned). */
async function ownAttempt(attemptId: string, userId: string) {
  const row = await db.query.assessmentAttempt.findFirst({
    where: eq(assessmentAttempt.id, attemptId),
    with: {
      assessment: {
        with: { module: { with: { semester: { with: { program: true } } } } },
      },
    },
  })
  if (!row || row.assessment.module.semester.program.userId !== userId) {
    throw new Error("Not found")
  }
  return row
}

export async function setAssessmentType(moduleId: string, type: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const parsed = z.enum(ASSESSMENT_TYPES).parse(type)
  await db
    .insert(moduleAssessment)
    .values({ moduleId, type: parsed })
    .onConflictDoUpdate({ target: moduleAssessment.moduleId, set: { type: parsed } })
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  return { ok: true as const }
}

export async function addAttempt(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = attemptSchema.parse(input)
  const assessmentId = await ensureAssessment(moduleId)

  const existing = await db.query.assessmentAttempt.findMany({
    where: eq(assessmentAttempt.assessmentId, assessmentId),
    orderBy: [asc(assessmentAttempt.attempt)],
    columns: { attempt: true },
  })
  if (existing.length >= mod.maxAttempts) {
    throw new Error("Maximale Versuchszahl erreicht")
  }
  const nextAttempt = existing.reduce((max, a) => Math.max(max, a.attempt), 0) + 1

  await db.insert(assessmentAttempt).values({
    assessmentId,
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
    .update(assessmentAttempt)
    .set({
      resultPercent: data.resultPercent != null ? String(data.resultPercent) : null,
      date: data.date ?? null,
      passed: data.passed ?? null,
      note: data.note ?? null,
    })
    .where(eq(assessmentAttempt.id, attemptId))
  const programId = row.assessment.module.semester.programId
  revalidatePath(`/studies/${programId}/${row.assessment.moduleId}`)
  return { ok: true as const }
}

export async function deleteAttempt(attemptId: string) {
  const session = await requireSession()
  const row = await ownAttempt(attemptId, session.user.id)
  await db.delete(assessmentAttempt).where(eq(assessmentAttempt.id, attemptId))
  const programId = row.assessment.module.semester.programId
  revalidatePath(`/studies/${programId}/${row.assessment.moduleId}`)
  return { ok: true as const }
}
