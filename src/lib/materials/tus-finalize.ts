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

  let saved: { storagePath: string; size: number; hash: string }
  try {
    const nodeStream = store.read(tusId)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
    saved = await saveStream(userId, fileName, webStream, { maxBytes })
  } catch (error) {
    console.error("[tus-finalize] failed to move staged upload into storage", tusId, error)
    await store.remove(tusId).catch(() => {})
    return
  }

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
    // registerUploadedFile already removed the stored object on quota failure.
    if (!(error instanceof QuotaExceededError)) {
      console.error("[tus-finalize] register failed", tusId, error)
    }
  } finally {
    await store.remove(tusId).catch(() => {})
  }
}
