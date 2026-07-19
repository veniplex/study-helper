"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { material, materialAnnotation, materialFolder } from "@/db/schema"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { deleteFile } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"
import {
  collectFolderSubtree,
  isDescendant,
  ownFolder,
  sanitizeSegment,
} from "@/lib/materials/folders"

const linkSchema = z.object({
  moduleId: z.string().min(1),
  name: z.string().min(1).max(300),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed"),
  folderId: z.string().min(1).optional().nullable(),
})

export async function createLinkMaterial(input: unknown) {
  const session = await requireSession()
  const data = linkSchema.parse(input)
  await ownModule(data.moduleId, session.user.id)
  const folderId = data.folderId ?? null
  await assertFolderInModule(folderId, data.moduleId, session.user.id)
  const [created] = await db
    .insert(material)
    .values({
      userId: session.user.id,
      moduleId: data.moduleId,
      kind: "link",
      name: data.name,
      url: data.url,
      folderId,
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

/** Re-runs extraction/embedding for a file material (idempotent — already
 *  embedded chunks for the active model are skipped). */
export async function retryMaterialProcessing(materialId: string) {
  const session = await requireSession()
  const row = await ownMaterial(materialId, session.user.id)
  if (row.kind !== "file") throw new Error("Not a file material")
  await db
    .update(material)
    .set({ extractionStatus: "pending", extractionError: null })
    .where(eq(material.id, materialId))
  const { enqueueEmbedMaterial } = await import("@/lib/jobs")
  await enqueueEmbedMaterial(materialId)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function renameMaterial(materialId: string, name: string) {
  const session = await requireSession()
  const clean = name.trim().slice(0, 300)
  if (!clean) actionError("MATERIAL_NAME_REQUIRED")
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

/** Validates that `folderId` belongs to the user and lives in `moduleId`. */
async function assertFolderInModule(
  folderId: string | null,
  moduleId: string,
  userId: string
): Promise<void> {
  if (folderId == null) return
  const folder = await ownFolder(folderId, userId)
  if (folder.moduleId !== moduleId) throw new Error("Folder is in another module")
}

export async function moveMaterialToFolder(materialId: string, folderId: string | null) {
  const session = await requireSession()
  const before = await ownMaterial(materialId, session.user.id)
  await assertFolderInModule(folderId, before.moduleId, session.user.id)
  await db.update(material).set({ folderId }).where(eq(material.id, materialId))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "material",
    entityId: materialId,
    entityLabel: before.name,
    before,
    after: { ...before, folderId },
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const foldersActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  folderId: z.string().min(1).nullable(),
})

/** Bulk-move materials into a folder (or the module root when folderId is null). */
export async function moveMaterialsToFolder(input: unknown) {
  const session = await requireSession()
  const { ids, folderId } = foldersActionSchema.parse(input)
  const rows = await db.query.material.findMany({
    where: and(inArray(material.id, ids), eq(material.userId, session.user.id)),
  })
  for (const row of rows) {
    await assertFolderInModule(folderId, row.moduleId, session.user.id)
  }
  await db
    .update(material)
    .set({ folderId })
    .where(and(inArray(material.id, ids), eq(material.userId, session.user.id)))
  revalidatePath("/", "layout")
  return { ok: true as const, count: rows.length }
}

const createFolderSchema = z.object({
  moduleId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(100),
})

/** Creates a (possibly empty, persistent) folder under an optional parent. */
export async function createFolder(input: unknown) {
  const session = await requireSession()
  const data = createFolderSchema.parse(input)
  await ownModule(data.moduleId, session.user.id)
  const parentId = data.parentId ?? null
  await assertFolderInModule(parentId, data.moduleId, session.user.id)
  const name = sanitizeSegment(data.name)
  if (!name) actionError("MATERIAL_NAME_REQUIRED")
  let created
  try {
    ;[created] = await db
      .insert(materialFolder)
      .values({ userId: session.user.id, moduleId: data.moduleId, parentId, name })
      .returning()
  } catch {
    actionError("FOLDER_DUPLICATE")
  }
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "materialFolder",
    entityId: created.id,
    entityLabel: name,
    after: created,
  })
  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

export async function renameFolder(folderId: string, newName: string) {
  const session = await requireSession()
  const before = await ownFolder(folderId, session.user.id)
  const name = sanitizeSegment(newName)
  if (!name) actionError("MATERIAL_NAME_REQUIRED")
  try {
    await db.update(materialFolder).set({ name }).where(eq(materialFolder.id, folderId))
  } catch {
    actionError("FOLDER_DUPLICATE")
  }
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "materialFolder",
    entityId: folderId,
    entityLabel: name,
    before,
    after: { ...before, name },
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function moveFolder(folderId: string, newParentId: string | null) {
  const session = await requireSession()
  const folder = await ownFolder(folderId, session.user.id)
  if (newParentId != null) {
    const parent = await ownFolder(newParentId, session.user.id)
    if (parent.moduleId !== folder.moduleId) throw new Error("Folder is in another module")
    // Moving a folder into itself or one of its descendants would orphan the subtree.
    if (await isDescendant(folderId, newParentId)) {
      throw new Error("Cannot move a folder into itself")
    }
  }
  try {
    await db.update(materialFolder).set({ parentId: newParentId }).where(eq(materialFolder.id, folderId))
  } catch {
    actionError("FOLDER_DUPLICATE")
  }
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const deleteFolderSchema = z.object({
  folderId: z.string().min(1),
  mode: z.enum(["recursive", "keepContents"]).default("recursive"),
})

export async function deleteFolder(input: unknown) {
  const session = await requireSession()
  const { folderId, mode } = deleteFolderSchema.parse(input)
  const folder = await ownFolder(folderId, session.user.id)

  if (mode === "keepContents") {
    // Reparent direct children folders and materials to this folder's parent,
    // then remove the now-empty folder.
    await db
      .update(materialFolder)
      .set({ parentId: folder.parentId })
      .where(eq(materialFolder.parentId, folderId))
    await db.update(material).set({ folderId: folder.parentId }).where(eq(material.folderId, folderId))
    await db.delete(materialFolder).where(eq(materialFolder.id, folderId))
  } else {
    // Delete every material blob + row in the subtree, then the folder (the FK
    // cascade removes descendant folders).
    const { materials } = await collectFolderSubtree(folderId)
    for (const m of materials) {
      if (m.storagePath) await deleteFile(m.storagePath)
    }
    if (materials.length > 0) {
      await db.delete(material).where(
        inArray(
          material.id,
          materials.map((m) => m.id)
        )
      )
    }
    await db.delete(materialFolder).where(eq(materialFolder.id, folderId))
  }

  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "materialFolder",
    entityId: folderId,
    entityLabel: folder.name,
    before: folder,
  })
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

/** Deletes one owned material: its blob, its row, and an audit entry. */
async function removeMaterial(row: typeof material.$inferSelect, userId: string): Promise<void> {
  if (row.storagePath) await deleteFile(row.storagePath)
  await db.delete(material).where(eq(material.id, row.id))
  // Note: file deletions cannot be undone — the audit undo restores the DB row
  // (links fully; file materials keep metadata but the blob is gone).
  await logAudit({
    userId,
    operation: "delete",
    entityType: "material",
    entityId: row.id,
    entityLabel: row.name,
    before: row,
  })
}

export async function deleteMaterial(materialId: string) {
  const session = await requireSession()
  const row = await ownMaterial(materialId, session.user.id)
  await removeMaterial(row, session.user.id)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const idsSchema = z.array(z.string().min(1)).min(1).max(500)

/** Bulk-delete owned materials (blobs + rows). */
export async function deleteMaterials(input: unknown) {
  const session = await requireSession()
  const ids = idsSchema.parse(input)
  const rows = await db.query.material.findMany({
    where: and(inArray(material.id, ids), eq(material.userId, session.user.id)),
  })
  for (const row of rows) {
    await removeMaterial(row, session.user.id)
  }
  revalidatePath("/", "layout")
  return { ok: true as const, count: rows.length }
}
