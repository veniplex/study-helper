import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { classifyFile } from "./filetypes"
import { extractPptxText, extractXlsxText } from "./office"

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")

/**
 * Cap on plain-text/code files read verbatim. Raised well above the old 2 MB so
 * large lecture transcripts / CSV exports are covered; still bounded so a single
 * pathological file can't exhaust memory (binary formats go through their own
 * parsers). Configurable via MAX_TEXT_EXTRACT_MB.
 */
const MAX_TEXT_BYTES = (Number(process.env.MAX_TEXT_EXTRACT_MB) || 25) * 1024 * 1024

function absolute(storagePath: string): string {
  const abs = path.resolve(UPLOAD_DIR, storagePath)
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) throw new Error("Invalid path")
  return abs
}

/**
 * Extracts plain text from a stored material file. Routing is by extension +
 * MIME (`classifyFile`), covering PDF, DOCX, PPTX, XLSX and all text/code
 * files. Returns null for types with no extractable text (images, audio, video
 * and unknown binaries) — those are handled by the media pipeline.
 */
export async function extractText(
  storagePath: string,
  mimeType: string | null
): Promise<string | null> {
  const abs = absolute(storagePath)
  const strategy = classifyFile(storagePath, mimeType)

  switch (strategy) {
    case "pdf": {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf")
      const buffer = await readFile(abs)
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await extractPdf(pdf, { mergePages: true })
      return text || null
    }
    case "docx": {
      const mammoth = await import("mammoth")
      const { value } = await mammoth.extractRawText({ buffer: await readFile(abs) })
      return value || null
    }
    case "pptx": {
      const text = extractPptxText(new Uint8Array(await readFile(abs)))
      return text || null
    }
    case "xlsx": {
      const text = extractXlsxText(new Uint8Array(await readFile(abs)))
      return text || null
    }
    case "text": {
      const buffer = await readFile(abs)
      return buffer.subarray(0, MAX_TEXT_BYTES).toString("utf8") || null
    }
    default:
      return null
  }
}
