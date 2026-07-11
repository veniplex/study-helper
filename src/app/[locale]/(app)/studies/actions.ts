"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  degreeProgram,
  externalResource,
  grade,
  moduleAssessment,
  semester,
  studyModule,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { encrypt } from "@/lib/crypto"
import { ownModule, ownProgram, ownSemester } from "@/lib/studies/access"

// ---- Degree programs -------------------------------------------------------

const gradeScaleSchema = z
  .array(
    z.object({
      minPercent: z.number().min(0).max(100),
      grade: z.number().min(1).max(6),
    })
  )
  .max(30)

const programSchema = z.object({
  name: z.string().min(1).max(200),
  degreeType: z.string().max(50).optional().nullable(),
  institution: z.string().max(200).optional().nullable(),
  targetEcts: z.number().int().min(1).max(1000).optional().nullable(),
  thesisMaxAttempts: z.number().int().min(1).max(5).default(2),
  gradeScale: gradeScaleSchema.optional().nullable(),
})

export async function updateGradeScale(programId: string, input: unknown) {
  const session = await requireSession()
  await ownProgram(programId, session.user.id)
  const scale = input == null ? null : gradeScaleSchema.parse(input)
  // Store descending by minPercent for a stable, readable order.
  const sorted = scale ? [...scale].sort((a, b) => b.minPercent - a.minPercent) : null
  await db.update(degreeProgram).set({ gradeScale: sorted }).where(eq(degreeProgram.id, programId))
  revalidatePath(`/studies/${programId}/settings`)
  revalidatePath("/")
  return { ok: true as const }
}

export async function createProgram(input: unknown) {
  const session = await requireSession()
  const data = programSchema.parse(input)
  const [created] = await db
    .insert(degreeProgram)
    .values({ ...data, userId: session.user.id })
    .returning({ id: degreeProgram.id })
  revalidatePath("/studies")
  return { ok: true as const, id: created.id }
}

export async function updateProgram(programId: string, input: unknown) {
  const session = await requireSession()
  await ownProgram(programId, session.user.id)
  const data = programSchema.partial().parse(input)
  await db.update(degreeProgram).set(data).where(eq(degreeProgram.id, programId))
  revalidatePath("/studies")
  return { ok: true as const }
}

export async function deleteProgram(programId: string) {
  const session = await requireSession()
  await ownProgram(programId, session.user.id)
  await db.delete(degreeProgram).where(eq(degreeProgram.id, programId))
  revalidatePath("/studies")
  return { ok: true as const }
}

// ---- Semesters ---------------------------------------------------------------

const semesterSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
})

export async function createSemester(programId: string, input: unknown) {
  const session = await requireSession()
  await ownProgram(programId, session.user.id)
  const data = semesterSchema.parse(input)
  await db.insert(semester).values({ ...data, programId })
  revalidatePath(`/studies/${programId}`)
  return { ok: true as const }
}

export async function updateSemester(semesterId: string, input: unknown) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const data = semesterSchema.partial().parse(input)
  await db.update(semester).set(data).where(eq(semester.id, semesterId))
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

export async function deleteSemester(semesterId: string) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  await db.delete(semester).where(eq(semester.id, semesterId))
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

// ---- Modules -----------------------------------------------------------------

const ASSESSMENT_TYPES = [
  "exam",
  "term_paper",
  "oral_presentation",
  "oral_exam",
  "project",
  "other",
] as const

const moduleSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  ects: z.number().int().min(0).max(60).optional().nullable(),
  instructor: z.string().max(200).optional().nullable(),
  examType: z.string().max(100).optional().nullable(),
  status: z.enum(["planned", "active", "passed", "failed"]).default("planned"),
  notes: z.string().max(5000).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  passFail: z.boolean().default(false),
  bonusType: z.enum(["none", "percent_points", "grade_steps"]).default("none"),
  bonusValue: z.number().min(0).max(100).optional().nullable(),
  bonusMinAvgPercent: z.number().min(0).max(100).optional().nullable(),
  bonusMinCompletedShare: z.number().min(0).max(1).optional().nullable(),
  assessmentType: z.enum(ASSESSMENT_TYPES).default("exam"),
})

/** Splits parsed module input into module-table columns (numbers→strings). */
function moduleValues(data: z.infer<typeof moduleSchema>) {
  const m = data
  return {
    name: m.name,
    code: m.code ?? null,
    ects: m.ects ?? null,
    instructor: m.instructor ?? null,
    examType: m.examType ?? null,
    status: m.status,
    notes: m.notes ?? null,
    icon: m.icon ?? null,
    color: m.color ?? null,
    maxAttempts: m.maxAttempts,
    passFail: m.passFail,
    bonusType: m.bonusType,
    bonusValue: m.bonusValue == null ? null : String(m.bonusValue),
    bonusMinAvgPercent: m.bonusMinAvgPercent == null ? null : String(m.bonusMinAvgPercent),
    bonusMinCompletedShare:
      m.bonusMinCompletedShare == null ? null : String(m.bonusMinCompletedShare),
  }
}

async function upsertAssessmentType(moduleId: string, type: (typeof ASSESSMENT_TYPES)[number]) {
  await db
    .insert(moduleAssessment)
    .values({ moduleId, type })
    .onConflictDoUpdate({ target: moduleAssessment.moduleId, set: { type } })
}

export async function createModule(semesterId: string, input: unknown) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const data = moduleSchema.parse(input)
  const [created] = await db
    .insert(studyModule)
    .values({ ...moduleValues(data), semesterId })
    .returning({ id: studyModule.id })
  await upsertAssessmentType(created.id, data.assessmentType)
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

export async function updateModule(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = moduleSchema.partial().parse(input)
  const { assessmentType, ...rest } = data
  const values = moduleValues({ ...moduleSchema.parse({ name: mod.name, ...rest }) })
  // Only set the columns the caller actually provided.
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    patch[key] = (values as Record<string, unknown>)[key]
  }
  if (Object.keys(patch).length > 0) {
    await db.update(studyModule).set(patch).where(eq(studyModule.id, moduleId))
  }
  if (assessmentType) await upsertAssessmentType(moduleId, assessmentType)
  revalidatePath(`/studies/${mod.semester.programId}`)
  return { ok: true as const }
}

export async function deleteModule(moduleId: string) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  await db.delete(studyModule).where(eq(studyModule.id, moduleId))
  revalidatePath(`/studies/${mod.semester.programId}`)
  return { ok: true as const }
}

export async function reorderModules(semesterId: string, ids: unknown) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const list = z.array(z.string()).max(200).parse(ids)
  await Promise.all(
    list.map((id, i) =>
      db
        .update(studyModule)
        .set({ sortOrder: i })
        .where(and(eq(studyModule.id, id), eq(studyModule.semesterId, semesterId)))
    )
  )
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

const reorderMovesSchema = z
  .array(z.object({ semesterId: z.string(), ids: z.array(z.string()).max(200) }))
  .max(50)

/**
 * Persists a drag-and-drop reorder that may also move modules between
 * semesters (dashboard board): sets sortOrder per position and, for modules
 * whose semester changed, moves them into the target semester.
 */
export async function reorderModulesAcrossSemesters(input: unknown) {
  const session = await requireSession()
  const moves = reorderMovesSchema.parse(input)

  const semesterIds = [...new Set(moves.map((m) => m.semesterId))]
  const semesters = await Promise.all(semesterIds.map((id) => ownSemester(id, session.user.id)))
  const semesterById = new Map(semesterIds.map((id, i) => [id, semesters[i]]))

  const allModuleIds = moves.flatMap((m) => m.ids)
  if (allModuleIds.length > 0) {
    const owned = await db.query.studyModule.findMany({
      where: inArray(studyModule.id, allModuleIds),
      with: { semester: { with: { program: true } } },
    })
    const ownedIds = new Set(owned.map((m) => m.id))
    if (
      owned.length !== allModuleIds.length ||
      owned.some((m) => m.semester.program.userId !== session.user.id) ||
      allModuleIds.some((id) => !ownedIds.has(id))
    ) {
      throw new Error("Not found")
    }
  }

  await Promise.all(
    moves.flatMap((m) =>
      m.ids.map((id, i) =>
        db
          .update(studyModule)
          .set({ sortOrder: i, semesterId: m.semesterId })
          .where(eq(studyModule.id, id))
      )
    )
  )

  const programIds = new Set(semesterIds.map((id) => semesterById.get(id)!.programId))
  for (const programId of programIds) revalidatePath(`/studies/${programId}`)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

// ---- Grades ------------------------------------------------------------------

const gradeSchema = z.object({
  value: z.number().min(0).max(1000),
  weight: z.number().positive().max(100).default(1),
  attempt: z.number().int().min(1).max(10).default(1),
  gradedAt: z.string().date().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
})

export async function addGrade(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = gradeSchema.parse(input)
  await db.insert(grade).values({
    moduleId,
    value: String(data.value),
    weight: String(data.weight),
    attempt: data.attempt,
    gradedAt: data.gradedAt ?? null,
    note: data.note ?? null,
  })
  revalidatePath(`/studies/${mod.semester.programId}`)
  return { ok: true as const }
}

export async function deleteGrade(gradeId: string) {
  const session = await requireSession()
  const row = await db.query.grade.findFirst({
    where: eq(grade.id, gradeId),
    with: { module: { with: { semester: true } } },
  })
  if (!row) throw new Error("Not found")
  await ownModule(row.moduleId, session.user.id)
  await db.delete(grade).where(eq(grade.id, gradeId))
  revalidatePath(`/studies/${row.module.semester.programId}`)
  return { ok: true as const }
}

// ---- External resources ------------------------------------------------------

const resourceSchema = z.object({
  type: z.enum(["moodle", "ilias", "fileshare", "discord", "teams", "website", "other"]),
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  username: z.string().max(200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
})

export async function createResource(
  target: { moduleId?: string; programId?: string },
  input: unknown
) {
  const session = await requireSession()
  if (target.moduleId) await ownModule(target.moduleId, session.user.id)
  else if (target.programId) await ownProgram(target.programId, session.user.id)
  else throw new Error("Target required")

  const data = resourceSchema.parse(input)
  await db.insert(externalResource).values({
    userId: session.user.id,
    moduleId: target.moduleId ?? null,
    programId: target.programId ?? null,
    type: data.type,
    name: data.name,
    url: data.url,
    username: data.username ?? null,
    encryptedNote: data.note ? encrypt(data.note) : null,
  })
  revalidatePath("/studies")
  return { ok: true as const }
}

export async function deleteResource(resourceId: string) {
  const session = await requireSession()
  await db
    .delete(externalResource)
    .where(
      and(eq(externalResource.id, resourceId), eq(externalResource.userId, session.user.id))
    )
  revalidatePath("/studies")
  return { ok: true as const }
}
