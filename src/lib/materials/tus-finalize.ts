import "server-only"
import { Readable } from "node:stream"
import { getSetting } from "@/lib/settings"
import { saveStream } from "@/lib/storage"
import { QuotaExceededError, registerUploadedFile } from "@/lib/materials/ingest"
import { TUS_DIR } from "@/lib/materials/tus-config"

export type FinalizeUploadPayload = {
  tusId: string
  userId: string
  moduleId: string
  folderId: string | null
  relativePath?: string
  fileName: string
  mimeType: string | null
}

/**
 * Finalizes a completed tus upload: streams the staged file into the configured
 * storage backend via `saveStream` (which computes size + sha256 for dedup),
 * registers the material through the shared ingest path, then removes the
 * staging file. Driver-agnostic — the same code path works for local disk and
 * S3 because it goes through `saveStream`.
 */
export async function finalizeUpload(payload: FinalizeUploadPayload): Promise<void> {
  const { tusId, userId, moduleId, folderId, relativePath, fileName, mimeType } = payload
  if (!userId || !moduleId) {
    console.error("[tus-finalize] missing userId/moduleId for", tusId)
    return
  }

  const { FileStore } = await import("@tus/file-store")
  const store = new FileStore({ directory: TUS_DIR })

  const uploads = await getSetting("uploads")
  const maxBytes = (uploads?.maxUploadMb ?? 200) * 1024 * 1024

  const nodeStream = store.read(tusId)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
  // Deliberately not caught: a failure here (storage unreachable, stream error)
  // is usually transient, and the staging file must survive for pg-boss to
  // retry the job. Swallowing it would lose the upload with no trace.
  const saved = await saveStream(userId, fileName, webStream, { maxBytes })

  try {
    await registerUploadedFile({
      userId,
      moduleId,
      folderId,
      relativePath,
      fileName,
      mimeType,
      saved,
    })
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      // Permanent for this upload — retrying would hit the same quota, and
      // registerUploadedFile already removed the stored object. Record it as a
      // failed material so the user sees why their upload disappeared.
      await recordFailedUpload(payload, "Upload exceeds your storage quota.")
      await store.remove(tusId).catch(() => {})
      return
    }
    // Transient (DB blip, storage hiccup): keep the staging file and rethrow so
    // pg-boss actually uses its configured retries. Swallowing this made
    // retryLimit dead code and left the blob orphaned with no material row.
    console.error("[tus-finalize] register failed, will retry", tusId, error)
    throw error
  }

  await store.remove(tusId).catch(() => {})
}

/** Surfaces a permanently failed upload in the materials list instead of dropping it silently. */
async function recordFailedUpload(payload: FinalizeUploadPayload, reason: string): Promise<void> {
  try {
    const { db } = await import("@/db")
    const { material } = await import("@/db/schema")
    await db.insert(material).values({
      userId: payload.userId,
      moduleId: payload.moduleId,
      kind: "file",
      name: payload.fileName,
      mimeType: payload.mimeType,
      folderId: payload.folderId,
      extractionStatus: "failed",
      extractionError: reason,
    })
  } catch (error) {
    console.error("[tus-finalize] could not record failed upload", payload.tusId, error)
  }
}
