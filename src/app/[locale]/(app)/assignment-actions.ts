"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { assignment, assignmentMaterial, material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"

const assignmentSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  status: z.enum(["open", "submitted", "graded"]).default("open"),
  kind: z.enum(["graded", "practice"]).default("graded"),
  pointsAchieved: z.number().min(0).max(100000).optional().nullable(),
  pointsMax: z.number().min(0).max(100000).optional().nullable(),
  materialIds: z.array(z.string()).max(50).default([]),
})

async function ownAssignment(assignmentId: string, userId: string) {
  const row = await db.query.assignment.findFirst({
    where: and(eq(assignment.id, assignmentId), eq(assignment.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

async function setMaterials(assignmentId: string, moduleId: string, materialIds: string[]) {
  await db.delete(assignmentMaterial).where(eq(assignmentMaterial.assignmentId, assignmentId))
  if (materialIds.length === 0) return
  // Only materials of the same module can be linked
  const valid = await db.query.material.findMany({
    where: and(inArray(material.id, materialIds), eq(material.moduleId, moduleId)),
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
    })
    .returning()
  await setMaterials(created.id, moduleId, data.materialIds)
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
    })
    .where(eq(assignment.id, assignmentId))
  await setMaterials(assignmentId, before.moduleId, data.materialIds)
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
