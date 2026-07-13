/**
 * Pure file-type classification for text extraction — maps a filename/MIME to
 * the extraction strategy. No I/O, so it's unit-testable.
 */

/** Code/plain-text extensions read verbatim as UTF-8. */
export const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".rst",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".ipynb",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".java",
  ".kt",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".scala",
  ".r",
  ".m",
  ".pl",
  ".lua",
  ".dart",
  ".vue",
  ".svelte",
  ".gradle",
  ".dockerfile",
])

export type ExtractStrategy = "pdf" | "docx" | "pptx" | "xlsx" | "text" | "image" | "audio" | null

/** Lower-cased extension (with dot) of a filename, or "" when none. */
export function extOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot < 0 ? "" : name.slice(dot).toLowerCase()
}

/**
 * Decides how to extract text from a file, based on its storage path and MIME.
 * Returns null when the type has no text to extract (and isn't image/audio,
 * which the media pipeline handles separately).
 */
export function classifyFile(storagePath: string, mimeType: string | null): ExtractStrategy {
  const ext = extOf(storagePath)
  const mime = (mimeType ?? "").toLowerCase()

  if (ext === ".pdf" || mime === "application/pdf") return "pdf"
  if (ext === ".docx") return "docx"
  if (ext === ".pptx") return "pptx"
  if (ext === ".xlsx") return "xlsx"
  if (TEXT_EXTENSIONS.has(ext)) return "text"
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return "text"
  }
  if (ext === ".dockerfile" || /(^|\/)dockerfile$/i.test(storagePath)) return "text"
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return "audio"
  return null
}
