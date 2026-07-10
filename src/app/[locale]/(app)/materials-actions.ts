"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { deleteFile } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"

const linkSchema = z.object({
  moduleId: z.string().min(1),
  name: z.string().min(1).max(300),
  url: z.string().url().max(2000),
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
