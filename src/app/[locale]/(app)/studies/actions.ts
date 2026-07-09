"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  degreeProgram,
  externalResource,
  grade,
  semester,
  studyModule,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { encrypt } from "@/lib/crypto"
import { ownModule, ownProgram, ownSemester } from "@/lib/studies/access"

// ---- Degree programs -------------------------------------------------------

const programSchema = z.object({
  name: z.string().min(1).max(200),
  degreeType: z.string().max(50).optional().nullable(),
  institution: z.string().max(200).optional().nullable(),
  targetEcts: z.number().int().min(1).max(1000).optional().nullable(),
  gradingSystem: z.enum(["german", "points", "passfail"]).default("german"),
})

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

const moduleSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  ects: z.number().int().min(0).max(60).optional().nullable(),
  instructor: z.string().max(200).optional().nullable(),
  examType: z.string().max(100).optional().nullable(),
  status: z.enum(["planned", "active", "passed", "failed"]).default("planned"),
  notes: z.string().max(5000).optional().nullable(),
})

export async function createModule(semesterId: string, input: unknown) {
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const data = moduleSchema.parse(input)
  await db.insert(studyModule).values({ ...data, semesterId })
  revalidatePath(`/studies/${sem.programId}`)
  return { ok: true as const }
}

export async function updateModule(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = moduleSchema.partial().parse(input)
  await db.update(studyModule).set(data).where(eq(studyModule.id, moduleId))
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
