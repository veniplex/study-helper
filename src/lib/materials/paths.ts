/**
 * Pure path/zip helpers for the materials feature — no DB or disk access, so
 * they can be unit-tested directly. The server-only modules (`folders.ts`,
 * `jobs/unpack-zip.ts`) import from here.
 */

/** Max length of a single folder-name segment. */
export const MAX_SEGMENT = 100

/**
 * Cleans one path segment: trims, collapses whitespace, strips characters that
 * would break a path or the UI, and rejects traversal segments. Returns null
 * for anything that isn't a usable folder name (empty, ".", "..").
 */
export function sanitizeSegment(raw: string): string | null {
  const cleaned = raw
    .replace(/[/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEGMENT)
  if (!cleaned || cleaned === "." || cleaned === "..") return null
  return cleaned
}

/** Splits a relative path like "a/b/c" into sanitized segments (drops empties). */
export function splitPath(path: string | null | undefined): string[] {
  if (!path) return []
  return path
    .split("/")
    .map((s) => sanitizeSegment(s))
    .filter((s): s is string => s !== null)
}

/** Minimal extension → MIME map for files that arrive without a usable type
 * (e.g. entries unpacked from a zip). Falls back to octet-stream. */
const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".zip": "application/zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

/** Best-effort MIME type from a filename, defaulting to octet-stream. */
export function mimeFromName(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  return EXT_MIME[name.slice(dot).toLowerCase()] ?? "application/octet-stream"
}

/** True when the filename/mime denotes a zip archive. */
export function isZip(name: string, mime: string | null | undefined): boolean {
  return (
    name.toLowerCase().endsWith(".zip") ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  )
}

export type ZipPlanEntry = { segments: string[]; name: string; data: Uint8Array }

export type ZipPlanOptions = {
  /** Max number of file entries to accept before failing. */
  maxEntries?: number
  /** Max total uncompressed bytes before failing (zip-bomb guard). */
  maxTotalBytes?: number
}

const DEFAULT_MAX_ENTRIES = 5000
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB uncompressed

/**
 * Turns raw unzip output into a safe, ordered list of file entries to import.
 * - Skips directory entries, `__MACOSX/` cruft and dotfiles.
 * - Rejects (skips) zip-slip entries: absolute paths, backslashes, or any `..`
 *   segment — traversal can never escape the target folder.
 * - Splits the remaining path into sanitized folder segments + a basename.
 * - Throws when the archive exceeds the entry-count or uncompressed-size caps.
 */
export function planZipEntries(
  entries: Record<string, Uint8Array>,
  opts: ZipPlanOptions = {}
): ZipPlanEntry[] {
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const plan: ZipPlanEntry[] = []
  let totalBytes = 0

  for (const [rawPath, data] of Object.entries(entries)) {
    // Directory entries come through with a trailing slash and empty data.
    if (rawPath.endsWith("/")) continue
    if (rawPath.startsWith("/") || rawPath.includes("\\")) continue
    if (rawPath.startsWith("__MACOSX/") || rawPath.includes("/__MACOSX/")) continue

    const rawSegments = rawPath.split("/")
    if (rawSegments.some((s) => s === "..")) continue

    const basename = rawSegments[rawSegments.length - 1]
    if (!basename || basename.startsWith(".")) continue // skip dotfiles like .DS_Store

    const folderSegments = rawSegments
      .slice(0, -1)
      .map((s) => sanitizeSegment(s))
      .filter((s): s is string => s !== null)

    totalBytes += data.byteLength
    if (totalBytes > maxTotalBytes) {
      throw new Error("Zip archive exceeds the maximum uncompressed size")
    }
    plan.push({ segments: folderSegments, name: basename, data })
    if (plan.length > maxEntries) {
      throw new Error("Zip archive contains too many files")
    }
  }
  return plan
}
