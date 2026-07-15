import "server-only"
import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { unzipSync } from "fflate"
import { db } from "@/db"
import { material } from "@/db/schema"
import { deleteFile, fileStream, safeInlineMime, saveFile } from "@/lib/storage"
import { findOrCreateFolderPath } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { mimeFromName, planZipEntries } from "@/lib/materials/paths"

export type UnpackZipPayload = {
  userId: string
  moduleId: string
  parentFolderId: string | null
  zipStoragePath: string
  zipName: string
}

/** Reads a stored file fully into a Buffer. */
async function readStored(storagePath: string): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  const reader = fileStream(storagePath).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/**
 * Expands an uploaded zip into individual materials, preserving its internal
 * folder structure under a folder named after the archive. Enqueues embedding
 * for each extracted file, then deletes the temporary zip blob. Guards against
 * zip-slip, dotfiles, and oversized/too-many-entry archives (via
 * `planZipEntries`).
 */
export async function unpackZip(payload: UnpackZipPayload): Promise<void> {
  const { userId, moduleId, parentFolderId, zipStoragePath, zipName } = payload
  try {
    const buffer = await readStored(zipStoragePath)
    const entries = unzipSync(new Uint8Array(buffer))
    const plan = planZipEntries(entries)

    const rootName = zipName.replace(/\.zip$/i, "") || "archive"
    const rootFolderId = await findOrCreateFolderPath(userId, moduleId, [rootName], parentFolderId)

    const { enqueueEmbedMaterial } = await import("@/lib/jobs")

    for (const entry of plan) {
      try {
        await assertStorageWithinLimit(userId, entry.data.byteLength)
      } catch {
        console.warn(`[unpack-zip] storage quota reached; stopping unpack of ${zipName}`)
        break
      }
      const contentHash = createHash("sha256").update(entry.data).digest("hex")
      // Skip an identical file already present in this module (incremental reuse).
      const duplicate = await db.query.material.findFirst({
        where: and(
          eq(material.userId, userId),
          eq(material.moduleId, moduleId),
          eq(material.contentHash, contentHash)
        ),
        columns: { id: true },
      })
      if (duplicate) continue

      const folderId = await findOrCreateFolderPath(
        userId,
        moduleId,
        entry.segments,
        rootFolderId
      )
      const storagePath = await saveFile(userId, entry.name, Buffer.from(entry.data))
      const [created] = await db
        .insert(material)
        .values({
          userId,
          moduleId,
          kind: "file",
          name: entry.name,
          storagePath,
          mimeType: safeInlineMime(mimeFromName(entry.name)),
          sizeBytes: entry.data.byteLength,
          contentHash,
          folderId,
          extractionStatus: "pending",
        })
        .returning({ id: material.id })
      try {
        await enqueueEmbedMaterial(created.id)
      } catch (error) {
        console.error("[unpack-zip] failed to enqueue embedding", error)
      }
    }
  } finally {
    // Discard the temporary archive regardless of outcome.
    await deleteFile(zipStoragePath)
  }
}
