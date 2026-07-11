"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { material, materialAnnotation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { deleteFile } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"

const linkSchema = z.object({
  moduleId: z.string().min(1),
  name: z.string().min(1).max(300),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed"),
  folder: z.string().max(100).optional().nullable(),
})

export async function createLinkMaterial(input: unknown) {
  const session = await requireSession()
  const data = linkSchema.parse(input)
  await ownModule(data.moduleId, session.user.id)
  const [created] = await db
    .insert(material)
    .values({
      userId: session.user.id,
      moduleId: data.moduleId,
      kind: "link",
      name: data.name,
      url: data.url,
      folder: data.folder ?? null,
    })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "material",
    entityId: created.id,
    entityLabel: data.name,
    after: created,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

async function ownMaterial(materialId: string, userId: string) {
  const row = await db.query.material.findFirst({
    where: and(eq(material.id, materialId), eq(material.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

export async function renameMaterial(materialId: string, name: string) {
  const session = await requireSession()
  const clean = name.trim().slice(0, 300)
  if (!clean) throw new Error("Name required")
  const before = await ownMaterial(materialId, session.user.id)
  await db.update(material).set({ name: clean }).where(eq(material.id, materialId))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "material",
    entityId: materialId,
    entityLabel: clean,
    before,
    after: { ...before, name: clean },
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function moveMaterialToFolder(materialId: string, folder: string | null) {
  const session = await requireSession()
  const clean = folder?.trim().slice(0, 100) || null
  const before = await ownMaterial(materialId, session.user.id)
  await db.update(material).set({ folder: clean }).where(eq(material.id, materialId))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "material",
    entityId: materialId,
    entityLabel: before.name,
    before,
    after: { ...before, folder: clean },
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function renameFolder(moduleId: string, oldName: string, newName: string) {
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  const clean = newName.trim().slice(0, 100)
  if (!clean) throw new Error("Name required")
  await db
    .update(material)
    .set({ folder: clean })
    .where(
      and(
        eq(material.moduleId, moduleId),
        eq(material.userId, session.user.id),
        eq(material.folder, oldName)
      )
    )
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function deleteFolder(moduleId: string, folderName: string) {
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  await db
    .update(material)
    .set({ folder: null })
    .where(
      and(
        eq(material.moduleId, moduleId),
        eq(material.userId, session.user.id),
        eq(material.folder, folderName)
      )
    )
  revalidatePath("/", "layout")
  return { ok: true as const }
}

// ---- PDF annotations ---------------------------------------------------------

const annotationSchema = z.object({
  page: z.number().int().min(1).max(5000),
  rect: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  }),
  color: z.enum(["yellow", "green", "red", "blue"]).default("yellow"),
  note: z.string().max(2000).optional().nullable(),
})

export async function createAnnotation(materialId: string, input: unknown) {
  const session = await requireSession()
  await ownMaterial(materialId, session.user.id)
  const data = annotationSchema.parse(input)
  const [created] = await db
    .insert(materialAnnotation)
    .values({
      materialId,
      userId: session.user.id,
      page: data.page,
      rect: data.rect,
      color: data.color,
      note: data.note ?? null,
    })
    .returning()
  return { ok: true as const, id: created.id }
}

export async function updateAnnotationNote(annotationId: string, note: string) {
  const session = await requireSession()
  const clean = note.trim().slice(0, 2000) || null
  await db
    .update(materialAnnotation)
    .set({ note: clean })
    .where(
      and(
        eq(materialAnnotation.id, annotationId),
        eq(materialAnnotation.userId, session.user.id)
      )
    )
  return { ok: true as const }
}

export async function deleteAnnotation(annotationId: string) {
  const session = await requireSession()
  await db
    .delete(materialAnnotation)
    .where(
      and(
        eq(materialAnnotation.id, annotationId),
        eq(materialAnnotation.userId, session.user.id)
      )
    )
  return { ok: true as const }
}

export async function deleteMaterial(materialId: string) {
  const session = await requireSession()
  const row = await db.query.material.findFirst({
    where: and(eq(material.id, materialId), eq(material.userId, session.user.id)),
  })
  if (!row) throw new Error("Not found")
  if (row.storagePath) await deleteFile(row.storagePath)
  await db.delete(material).where(eq(material.id, materialId))
  // Note: file deletions cannot be undone — the audit undo restores the DB row
  // (links fully; file materials keep metadata but the blob is gone).
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "material",
    entityId: materialId,
    entityLabel: row.name,
    before: row,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}
