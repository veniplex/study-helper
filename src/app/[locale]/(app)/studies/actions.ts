"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  degreeProgram,
  externalResource,
  moduleGoal,
  semester,
  studyModule,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { encrypt } from "@/lib/crypto"
import { ownModule, ownProgram, ownSemester } from "@/lib/studies/access"
import { sweepModuleFiles, sweepProgramFiles, sweepSemesterFiles } from "@/lib/studies/orphan-cleanup"

// ---- Degree programs -------------------------------------------------------

const gradeScaleSchema = z
  .array(
    z.object({
      minPercent: z.number().min(0).max(100),
      grade: z.number().min(1).max(6),
    })
  )
  // A percent→grade table can be fine-grained (e.g. one row per percentage
  // point), so allow a generous number of rows.
  .max(200)

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

const gradeGoalSchema = z.string().max(10).nullable()

export async function updateGradeGoal(programId: string, input: unknown) {
  const session = await requireSession()
  await ownProgram(programId, session.user.id)
  const gradeGoal = gradeGoalSchema.parse(input)
  await db.update(degreeProgram).set({ gradeGoal }).where(eq(degreeProgram.id, programId))
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
  // The FK cascade removes the material rows but not their storage blobs — sweep
  // them first (collect paths → background delete) so files aren't orphaned.
  await sweepProgramFiles(programId)
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
  await sweepSemesterFiles(semesterId)
  await db.delete(semester).where(eq(semester.id, semesterId))
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

// ---- Modules -----------------------------------------------------------------

const moduleSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  ects: z.number().int().min(0).max(60).optional().nullable(),
  instructor: z.string().max(200).optional().nullable(),
  status: z.enum(["planned", "active", "passed", "failed"]).default("planned"),
  notes: z.string().max(5000).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
})

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

/** Create adds an optional goal-type multiselect that seeds the module's goals. */
const createModuleSchema = moduleSchema.extend({
  goalTypes: z.array(goalTypeEnum).max(8).optional(),
})

/** Splits parsed module input into module-table columns. */
function moduleValues(data: z.infer<typeof moduleSchema>) {
  const m = data
  return {
    name: m.name,
    code: m.code ?? null,
    ects: m.ects ?? null,
    instructor: m.instructor ?? null,
    status: m.status,
    notes: m.notes ?? null,
    icon: m.icon ?? null,
    color: m.color ?? null,
  }
}

export async function createModule(semesterId: string, input: unknown) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const data = createModuleSchema.parse(input)
  // Module insert + goal seeding must be atomic: a module with no goals breaks
  // grade/tab derivation, so a failed goal insert must roll back the module too.
  const types = data.goalTypes?.length ? [...new Set(data.goalTypes)] : ["exam" as const]
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(studyModule)
      .values({ ...moduleValues(data), semesterId })
      .returning({ id: studyModule.id })
    // Seed one goal per selected type (deduped); modules created without a
    // selection keep a single default exam goal so they are immediately gradable.
    await tx.insert(moduleGoal).values(
      types.map((type, i) => ({
        moduleId: created.id,
        type,
        gradingRole: "grade" as const,
        sortOrder: i,
      }))
    )
  })
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

export async function updateModule(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = moduleSchema.partial().parse(input)
  const values = moduleValues({ ...moduleSchema.parse({ name: mod.name, ...data }) })
  // Only set the columns the caller actually provided.
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    patch[key] = (values as Record<string, unknown>)[key]
  }
  if (Object.keys(patch).length > 0) {
    await db.update(studyModule).set(patch).where(eq(studyModule.id, moduleId))
  }
  revalidatePath(`/studies/${mod.semester.programId}`)
  return { ok: true as const }
}

export async function deleteModule(moduleId: string) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  await sweepModuleFiles(moduleId)
  await db.delete(studyModule).where(eq(studyModule.id, moduleId))
  revalidatePath(`/studies/${mod.semester.programId}`)
  return { ok: true as const }
}

/** Force-show/hide of the optional workspace tools (matrix ⊕ overrides). */
const toolOverridesSchema = z.object({
  assignments: z.boolean().optional(),
  decks: z.boolean().optional(),
  quizzes: z.boolean().optional(),
  paper: z.boolean().optional(),
})

/**
 * Toggles a module's optional workspace tools. Overrides are merged into the
 * existing `toolOverrides` map (other keys untouched) and drive both the tab
 * bar and the sidebar tree.
 */
export async function updateModuleTools(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const overrides = toolOverridesSchema.parse(input)
  const merged = { ...(mod.toolOverrides ?? {}), ...overrides }
  await db.update(studyModule).set({ toolOverrides: merged }).where(eq(studyModule.id, moduleId))
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  revalidatePath("/", "layout")
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

  // One transaction, one statement per target semester. The previous version
  // fired up to 50×200 independent updates concurrently: they competed for the
  // small connection pool, and a failure part-way through left modules stranded
  // in the wrong semester with no way back.
  await db.transaction(async (tx) => {
    for (const move of moves) {
      if (move.ids.length === 0) continue
      const order = sql.join(
        move.ids.map((id, i) => sql`(${id}::text, ${i}::integer)`),
        sql`, `
      )
      await tx.execute(sql`
        UPDATE "module" AS m
        SET sort_order = v.ord, semester_id = ${move.semesterId}
        FROM (VALUES ${order}) AS v(id, ord)
        WHERE m.id = v.id
      `)
    }
  })

  const programIds = new Set(semesterIds.map((id) => semesterById.get(id)!.programId))
  for (const programId of programIds) revalidatePath(`/studies/${programId}`)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

// ---- Grades ------------------------------------------------------------------



// ---- External resources ------------------------------------------------------

const resourceSchema = z.object({
  type: z.enum(["moodle", "ilias", "fileshare", "discord", "teams", "website", "other"]),
  name: z.string().min(1).max(200),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed"),
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

export async function updateResource(resourceId: string, input: unknown) {
  const session = await requireSession()
  const data = resourceSchema.parse(input)
  const result = await db
    .update(externalResource)
    .set({
      type: data.type,
      name: data.name,
      url: data.url,
      username: data.username ?? null,
      encryptedNote: data.note ? encrypt(data.note) : null,
    })
    .where(
      and(eq(externalResource.id, resourceId), eq(externalResource.userId, session.user.id))
    )
    .returning({ id: externalResource.id })
  if (result.length === 0) throw new Error("Not found")
  revalidatePath("/studies")
  revalidatePath("/", "layout")
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
