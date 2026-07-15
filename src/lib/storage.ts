import "server-only"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

/** Thrown by saveStream when the incoming stream exceeds the byte limit. */
export class StorageLimitError extends Error {
  constructor(message = "File exceeds the maximum allowed size") {
    super(message)
    this.name = "StorageLimitError"
  }
}

/**
 * Local-disk storage for uploaded materials. All paths are relative to
 * UPLOAD_DIR so the database stays portable across hosts.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")

function absolute(relPath: string): string {
  const abs = path.resolve(UPLOAD_DIR, relPath)
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) throw new Error("Invalid path")
  return abs
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
  const normalized = (mime ?? "").split(";")[0].trim().toLowerCase()
  if (!normalized || ACTIVE_CONTENT_MIMES.has(normalized)) return "application/octet-stream"
  return normalized
}

function sanitizeName(filename: string): string {
  return filename.replace(/[^\w.\-()\[\] ]/g, "_").slice(-150) || "file"
}

/** Stores a buffer and returns the relative storage path. */
export async function saveFile(userId: string, filename: string, data: Buffer): Promise<string> {
  const relPath = path.join(userId, `${crypto.randomUUID()}-${sanitizeName(filename)}`)
  const abs = absolute(relPath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, data)
  return relPath.replaceAll(path.sep, "/")
}

/**
 * Streams an upload straight to disk without ever holding the whole file in
 * memory (unlike `formData()` + `arrayBuffer()`), computing the byte size and a
 * sha256 content hash as it goes. Enforces `maxBytes` mid-stream and removes the
 * partial file if the limit is exceeded or the stream errors.
 */
export async function saveStream(
  userId: string,
  filename: string,
  body: ReadableStream<Uint8Array>,
  opts: { maxBytes?: number } = {}
): Promise<{ storagePath: string; size: number; hash: string }> {
  const relPath = path.join(userId, `${crypto.randomUUID()}-${sanitizeName(filename)}`)
  const abs = absolute(relPath)
  await mkdir(path.dirname(abs), { recursive: true })

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

  try {
    const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(source, meter, createWriteStream(abs))
  } catch (error) {
    await unlink(abs).catch(() => {})
    throw error
  }

  return { storagePath: relPath.replaceAll(path.sep, "/"), size, hash: hash.digest("hex") }
}

/** Persists extracted plain text to disk (out of the DB) and returns its path. */
export async function saveText(userId: string, filename: string, text: string): Promise<string> {
  return saveFile(userId, filename, Buffer.from(text, "utf8"))
}

/** Reads a stored UTF-8 text file (e.g. extracted material text). */
export async function readStoredText(relPath: string): Promise<string> {
  return readFile(absolute(relPath), "utf8")
}

export async function deleteFile(relPath: string): Promise<void> {
  try {
    await unlink(absolute(relPath))
  } catch {
    // already gone — fine
  }
}

export async function fileSize(relPath: string): Promise<number> {
  return (await stat(absolute(relPath))).size
}

/** Returns a Web ReadableStream for a stored file, optionally a byte range. */
export function fileStream(relPath: string, start?: number, end?: number): ReadableStream {
  const nodeStream = createReadStream(absolute(relPath), start != null ? { start, end } : {})
  return Readable.toWeb(nodeStream) as ReadableStream
}
