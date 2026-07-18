import "server-only"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { deleteFile, safeInlineMime } from "@/lib/storage"
import { findOrCreateFolderPath, splitPath } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { isZip } from "@/lib/materials/paths"

/** Thrown when the finished file would exceed the user's storage quota. The
 *  partial storage object has already been removed when this is thrown. */
export class QuotaExceededError extends Error {
  constructor() {
    super("Storage quota exceeded")
    this.name = "QuotaExceededError"
  }
}

export type SavedFile = { storagePath: string; size: number; hash: string }

export type RegisterInput = {
  userId: string
  moduleId: string
  folderId: string | null
  relativePath?: string
  fileName: string
  mimeType: string | null
  saved: SavedFile
}

export type RegisterResult =
  { kind: "queued" } | { kind: "deduped"; id: string } | { kind: "created"; id: string }

/**
 * Turns a file already streamed into storage (`saved`) into a material:
 * resolves the destination folder, enforces the storage quota, unpacks zips in
 * the background, de-duplicates by content hash, inserts the material row and
 * enqueues embedding. Shared by the direct upload route and the tus
 * resumable-upload finalizer so both paths behave identically.
 */
export async function registerUploadedFile(input: RegisterInput): Promise<RegisterResult> {
  const { userId, moduleId, folderId, relativePath, fileName, mimeType, saved } = input

  // Resolve destination folder: leading directories of relativePath are created
  // (nested) under the current folder.
  let targetFolderId = folderId
  if (relativePath) {
    const segments = splitPath(path.posix.dirname(relativePath))
    targetFolderId = await findOrCreateFolderPath(userId, moduleId, segments, folderId)
  }

  // Authoritative storage-quota check now that the real size is known.
  try {
    await assertStorageWithinLimit(userId, saved.size)
  } catch {
    await deleteFile(saved.storagePath)
    throw new QuotaExceededError()
  }

  // Zip archives are unpacked in the background into a same-named folder — the
  // archive itself is not kept as a material.
  if (isZip(fileName, mimeType)) {
    try {
      const { enqueueUnpackZip } = await import("@/lib/jobs")
      await enqueueUnpackZip({
        userId,
        moduleId,
        parentFolderId: targetFolderId,
        zipStoragePath: saved.storagePath,
        zipName: fileName,
      })
    } catch (error) {
      console.error("[ingest] failed to enqueue unpack job", error)
      await deleteFile(saved.storagePath)
      throw error
    }
    return { kind: "queued" }
  }

  // Incremental reuse: an identical file (same content hash) already in this
  // module is not re-stored or re-processed.
  const duplicate = await db.query.material.findFirst({
    where: and(
      eq(material.userId, userId),
      eq(material.moduleId, moduleId),
      eq(material.contentHash, saved.hash)
    ),
    columns: { id: true },
  })
  if (duplicate) {
    await deleteFile(saved.storagePath)
    return { kind: "deduped", id: duplicate.id }
  }

  const [created] = await db
    .insert(material)
    .values({
      userId,
      moduleId,
      kind: "file",
      name: fileName,
      storagePath: saved.storagePath,
      mimeType: safeInlineMime(mimeType),
      sizeBytes: saved.size,
      contentHash: saved.hash,
      folderId: targetFolderId,
      extractionStatus: "pending",
    })
    .returning()

  const { logAudit } = await import("@/lib/audit")
  await logAudit({
    userId,
    operation: "create",
    entityType: "material",
    entityId: created.id,
    entityLabel: fileName,
    after: created,
  })

  // Kick off text extraction + embedding in the background. A failed enqueue
  // (e.g. job system unreachable) must not fail the upload, but it also must
  // not stay invisible — mark the material failed so the UI offers a retry.
  try {
    const { enqueueEmbedMaterial } = await import("@/lib/jobs")
    await enqueueEmbedMaterial(created.id)
  } catch (error) {
    console.error("[ingest] failed to enqueue embedding job", error)
    await db
      .update(material)
      .set({
        extractionStatus: "failed",
        extractionError: "Processing could not be scheduled — retry via the material menu.",
      })
      .where(eq(material.id, created.id))
  }

  return { kind: "created", id: created.id }
}
