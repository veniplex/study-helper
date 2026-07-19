import "server-only"
import { FileStore } from "@tus/file-store"
import { MemoryLocker, Server, type Upload } from "@tus/server"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { ownModule } from "@/lib/studies/access"
import { ownFolder } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { TUS_DIR, TUS_PATH } from "@/lib/materials/tus-config"

// Resumable (tus protocol) upload endpoint for very large files: an interrupted
// upload resumes at the last byte offset instead of restarting. Files are staged
// under TUS_DIR and, on completion, a background job streams them into the
// configured storage backend (local or S3) and creates the material — reusing
// the same ingest path as the direct upload route. The small direct-upload route
// (/api/materials/upload) remains the default for small files.

const globalForTus = globalThis as unknown as { tusServer?: Server }

/** Aborts a tus request with a specific HTTP status (tus reads status_code/body). */
function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { status_code: statusCode, body: message })
}

function metaString(value: string | null | undefined): string {
  return (value ?? "").trim()
}

function getServer(): Server {
  if (globalForTus.tusServer) return globalForTus.tusServer

  const server = new Server({
    path: TUS_PATH,
    datastore: new FileStore({ directory: TUS_DIR }),
    // Process-local lock: fine because all PATCH/HEAD requests for one upload
    // hit the web tier, and finalization happens later in a background job.
    locker: new MemoryLocker(),
    respectForwardedHeaders: true,
    async onIncomingRequest(req, uploadId) {
      const session = await getSession()
      if (!session) throw httpError(401, "Unauthorized")

      // For requests against an EXISTING upload (resume/status/abort), verify
      // the stamped owner matches the caller. onUploadCreate stamps userId; POST
      // creation carries a not-yet-persisted id, so only guard PATCH/HEAD/DELETE.
      const method = req.method?.toUpperCase()
      if ((method === "PATCH" || method === "HEAD" || method === "DELETE") && uploadId) {
        let upload
        try {
          upload = await server.datastore.getUpload(uploadId)
        } catch {
          return // unknown id — let tus return its normal 404
        }
        if (metaString(upload.metadata?.userId) !== session.user.id) {
          throw httpError(404, "Not found")
        }
      }
    },
    async onUploadCreate(_req, upload) {
      const session = await getSession()
      if (!session) throw httpError(401, "Unauthorized")
      const userId = session.user.id

      const meta = upload.metadata ?? {}
      const moduleId = metaString(meta.moduleId)
      const folderId = metaString(meta.folderId) || null
      if (!moduleId) throw httpError(400, "moduleId required")

      try {
        await ownModule(moduleId, userId)
        if (folderId) {
          const folder = await ownFolder(folderId, userId)
          if (folder.moduleId !== moduleId) throw new Error("mismatch")
        }
      } catch {
        throw httpError(404, "Not found")
      }

      const uploads = await getSetting("uploads")
      const maxUploadMb = uploads?.maxUploadMb ?? 200
      const maxBytes = maxUploadMb * 1024 * 1024
      if (upload.size != null && upload.size > maxBytes) {
        throw httpError(413, `File too large (max ${maxUploadMb} MB)`)
      }
      if (upload.size != null && upload.size > 0) {
        try {
          await assertStorageWithinLimit(userId, upload.size)
        } catch {
          throw httpError(413, "Storage quota exceeded")
        }
      }

      // Stamp the authenticated userId into the stored metadata so the finalize
      // job trusts it rather than any client-supplied value.
      return { metadata: { ...meta, userId } }
    },
    async onUploadFinish(_req, upload) {
      await enqueueFinalize(upload)
      return {}
    },
  })

  globalForTus.tusServer = server
  return server
}

async function enqueueFinalize(upload: Upload): Promise<void> {
  const meta = upload.metadata ?? {}
  const { enqueueFinalizeUpload } = await import("@/lib/jobs")
  await enqueueFinalizeUpload({
    tusId: upload.id,
    userId: metaString(meta.userId),
    moduleId: metaString(meta.moduleId),
    folderId: metaString(meta.folderId) || null,
    relativePath: metaString(meta.relativePath) || undefined,
    fileName: metaString(meta.filename) || metaString(meta.name) || upload.id,
    mimeType: meta.filetype ?? null,
  })
}

const handler = (request: Request): Promise<Response> => getServer().handleWeb(request)

export { handler as POST, handler as PATCH, handler as HEAD, handler as OPTIONS, handler as DELETE }
