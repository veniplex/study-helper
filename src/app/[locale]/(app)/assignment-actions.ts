"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { assignment, assignmentMaterial, material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"

const subtaskSchema = z.object({
  id: z.string().max(50),
  title: z.string().min(1).max(300),
  done: z.boolean().default(false),
})

const assignmentSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  status: z.enum(["open", "submitted", "graded"]).default("open"),
  kind: z.enum(["graded", "practice"]).default("graded"),
  pointsAchieved: z.number().min(0).max(100000).optional().nullable(),
  pointsMax: z.number().min(0).max(100000).optional().nullable(),
  materialIds: z.array(z.string()).max(50).default([]),
  subtasks: z.array(subtaskSchema).max(50).optional().nullable(),
})

async function ownAssignment(assignmentId: string, userId: string) {
  const row = await db.query.assignment.findFirst({
    where: and(eq(assignment.id, assignmentId), eq(assignment.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

async function setMaterials(
  assignmentId: string,
  moduleId: string,
  userId: string,
  materialIds: string[]
) {
  await db.delete(assignmentMaterial).where(eq(assignmentMaterial.assignmentId, assignmentId))
  if (materialIds.length === 0) return
  // Only the user's own materials of the same module can be linked
  const valid = await db.query.material.findMany({
    where: and(
      inArray(material.id, materialIds),
      eq(material.moduleId, moduleId),
      eq(material.userId, userId)
    ),
    columns: { id: true },
  })
  if (valid.length > 0) {
    await db
      .insert(assignmentMaterial)
      .values(valid.map((m) => ({ assignmentId, materialId: m.id })))
  }
}

export async function createAssignment(moduleId: string, input: unknown) {
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  const data = assignmentSchema.parse(input)
  const [created] = await db
    .insert(assignment)
    .values({
      userId: session.user.id,
      moduleId,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      status: data.status,
      kind: data.kind,
      pointsAchieved: data.pointsAchieved != null ? String(data.pointsAchieved) : null,
      pointsMax: data.pointsMax != null ? String(data.pointsMax) : null,
      subtasks: data.subtasks?.length ? data.subtasks : null,
    })
    .returning()
  await setMaterials(created.id, moduleId, session.user.id, data.materialIds)
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "assignment",
    entityId: created.id,
    entityLabel: data.title,
    after: created,
  })
  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

export async function updateAssignment(assignmentId: string, input: unknown) {
  const session = await requireSession()
  const before = await ownAssignment(assignmentId, session.user.id)
  const data = assignmentSchema.parse(input)
  await db
    .update(assignment)
    .set({
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      status: data.status,
      kind: data.kind,
      pointsAchieved: data.pointsAchieved != null ? String(data.pointsAchieved) : null,
      pointsMax: data.pointsMax != null ? String(data.pointsMax) : null,
      subtasks: data.subtasks?.length ? data.subtasks : null,
    })
    .where(eq(assignment.id, assignmentId))
  await setMaterials(assignmentId, before.moduleId, session.user.id, data.materialIds)
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "assignment",
    entityId: assignmentId,
    entityLabel: data.title,
    before,
    after: { ...before, ...data },
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

/** Toggles one subtask of an assignment's checklist. */
export async function toggleSubtask(assignmentId: string, subtaskId: string, done: boolean) {
  const session = await requireSession()
  const row = await ownAssignment(assignmentId, session.user.id)
  const subtasks = (row.subtasks ?? []).map((s) =>
    s.id === subtaskId ? { ...s, done } : s
  )
  await db.update(assignment).set({ subtasks }).where(eq(assignment.id, assignmentId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const seriesSchema = z.object({
  /** Base title; sheets are numbered "Title 1..count". */
  title: z.string().min(1).max(280),
  kind: z.enum(["graded", "practice"]).default("graded"),
  /** Due date of the first sheet. */
  firstDueDate: z.string().date(),
  count: z.number().int().min(2).max(30),
  intervalWeeks: z.number().int().min(1).max(4).default(1),
  pointsMax: z.number().min(0).max(100000).optional().nullable(),
})

/** Creates a numbered series of assignments (weekly problem sheets). */
export async function createAssignmentSeries(moduleId: string, input: unknown) {
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  const data = seriesSchema.parse(input)

  const rows = Array.from({ length: data.count }, (_, i) => {
    const due = new Date(`${data.firstDueDate}T12:00`)
    due.setDate(due.getDate() + i * data.intervalWeeks * 7)
    const pad = (n: number) => String(n).padStart(2, "0")
    return {
      userId: session.user.id,
      moduleId,
      title: `${data.title} ${i + 1}`,
      kind: data.kind,
      dueDate: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
      pointsMax: data.pointsMax != null ? String(data.pointsMax) : null,
    }
  })
  await db.insert(assignment).values(rows)
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "assignment",
    entityId: "series",
    entityLabel: `${data.title} 1–${data.count}`,
  })
  revalidatePath("/", "layout")
  return { ok: true as const, count: data.count }
}

export async function deleteAssignment(assignmentId: string) {
  const session = await requireSession()
  const before = await ownAssignment(assignmentId, session.user.id)
  await db.delete(assignment).where(eq(assignment.id, assignmentId))
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "assignment",
    entityId: assignmentId,
    entityLabel: before.title,
    before,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}
