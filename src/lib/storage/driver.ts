import { createHash, type Hash } from "node:crypto"
import { Transform } from "node:stream"

/** Thrown by saveStream when the incoming stream exceeds the byte limit. */
export class StorageLimitError extends Error {
  constructor(message = "File exceeds the maximum allowed size") {
    super(message)
    this.name = "StorageLimitError"
  }
}

// MIME types a browser would execute in the app's origin when served inline.
const ACTIVE_CONTENT_MIMES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
])

/**
 * Returns a MIME type that is safe to serve inline from the app origin.
 * Active content (HTML, SVG, XML) is downgraded to octet-stream so a stored
 * file can never run scripts in the app's origin.
 */
export function safeInlineMime(mime: string | null | undefined): string {
  const normalized = ((mime ?? "").split(";")[0] ?? "").trim().toLowerCase()
  if (!normalized || ACTIVE_CONTENT_MIMES.has(normalized)) return "application/octet-stream"
  return normalized
}

function sanitizeName(filename: string): string {
  return filename.replace(/[^\w.\-()\[\] ]/g, "_").slice(-150) || "file"
}

/**
 * Builds the canonical, forward-slash storage key for a new upload:
 * `<userId>/<uuid>-<sanitized name>`. This string is the value persisted in the
 * database and the identifier every driver maps onto its backend (a filesystem
 * path for local, an object key for S3), so it must stay backend-agnostic.
 */
export function buildRelPath(userId: string, filename: string): string {
  return `${userId}/${crypto.randomUUID()}-${sanitizeName(filename)}`
}

/** Result of streaming an upload to storage. */
export type SaveStreamResult = { storagePath: string; size: number; hash: string }

/**
 * A pass-through transform that counts bytes, computes a sha256 hash, and aborts
 * with StorageLimitError once `maxBytes` is exceeded. Shared by every driver so
 * size/hash/limit semantics are identical regardless of the storage backend.
 */
export function createUploadMeter(opts: { maxBytes?: number }): {
  meter: Transform
  hash: Hash
  size: () => number
} {
  const hash = createHash("sha256")
  let size = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length
      if (opts.maxBytes != null && size > opts.maxBytes) {
        cb(new StorageLimitError())
        return
      }
      hash.update(chunk)
      cb(null, chunk)
    },
  })
  return { meter, hash, size: () => size }
}

/**
 * Backend-agnostic storage operations. Two implementations exist — a local-disk
 * driver (default) and an S3/object-storage driver — selected by STORAGE_DRIVER.
 * Every method takes/returns the backend-agnostic relative path from
 * `buildRelPath`, so switching drivers never changes what is stored in the DB.
 */
export interface StorageDriver {
  saveBuffer(userId: string, filename: string, data: Buffer): Promise<string>
  saveStream(
    userId: string,
    filename: string,
    body: ReadableStream<Uint8Array>,
    opts?: { maxBytes?: number }
  ): Promise<SaveStreamResult>
  readBuffer(relPath: string): Promise<Buffer>
  deleteFile(relPath: string): Promise<void>
  fileSize(relPath: string): Promise<number>
  fileStream(relPath: string, start?: number, end?: number): Promise<ReadableStream>
}
