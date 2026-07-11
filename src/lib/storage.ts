import "server-only"
import { createReadStream } from "node:fs"
import { mkdir, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

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

/** Stores a buffer and returns the relative storage path. */
export async function saveFile(userId: string, filename: string, data: Buffer): Promise<string> {
  const safeName = filename.replace(/[^\w.\-()\[\] ]/g, "_").slice(-150)
  const relPath = path.join(userId, `${crypto.randomUUID()}-${safeName}`)
  const abs = absolute(relPath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, data)
  return relPath.replaceAll(path.sep, "/")
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
