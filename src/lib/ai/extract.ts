import "server-only"
import { fileSize, readFileBuffer } from "@/lib/storage"
import { classifyFile } from "./filetypes"
import { extractPptxText, extractXlsxText } from "./office"

/**
 * Cap on plain-text/code files read verbatim. Raised well above the old 2 MB so
 * large lecture transcripts / CSV exports are covered; still bounded so a single
 * pathological file can't exhaust memory (binary formats go through their own
 * parsers). Configurable via MAX_TEXT_EXTRACT_MB.
 */
const MAX_TEXT_BYTES = (Number(process.env.MAX_TEXT_EXTRACT_MB) || 25) * 1024 * 1024

/**
 * Cap for binary document formats (PDF/DOCX/PPTX/XLSX), which must be loaded
 * fully into memory for their parsers. Configurable via MAX_DOC_EXTRACT_MB.
 */
const MAX_DOC_BYTES = (Number(process.env.MAX_DOC_EXTRACT_MB) || 300) * 1024 * 1024

export class ExtractionTooLargeError extends Error {
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `File too large to extract (${Math.round(sizeBytes / 1024 / 1024)} MB, ` +
        `max ${Math.round(maxBytes / 1024 / 1024)} MB)`
    )
    this.name = "ExtractionTooLargeError"
  }
}

async function assertExtractableSize(storagePath: string, maxBytes: number): Promise<void> {
  const size = await fileSize(storagePath)
  if (size > maxBytes) throw new ExtractionTooLargeError(size, maxBytes)
}

/** Truncates to at most `maxBytes` without splitting a multi-byte UTF-8 char. */
export function truncateUtf8(buffer: Buffer, maxBytes: number): string {
  if (buffer.length <= maxBytes) return buffer.toString("utf8")
  let end = maxBytes
  // Back up past any continuation bytes (10xxxxxx) so the cut lands on a
  // character boundary instead of producing a replacement char.
  // end starts at maxBytes < buffer.length and only shrinks, so buffer[end] exists.
  while (end > 0 && (buffer[end]! & 0b1100_0000) === 0b1000_0000) end--
  return buffer.subarray(0, end).toString("utf8")
}

/**
 * Extracts plain text from a stored material file. Routing is by extension +
 * MIME (`classifyFile`), covering PDF, DOCX, PPTX, XLSX and all text/code
 * files. Returns null for types with no extractable text (images, audio, video
 * and unknown binaries) — those are handled by the media pipeline.
 * Throws ExtractionTooLargeError for files beyond the memory-safety caps.
 */
export async function extractText(
  storagePath: string,
  mimeType: string | null
): Promise<string | null> {
  const strategy = classifyFile(storagePath, mimeType)

  switch (strategy) {
    case "pdf": {
      await assertExtractableSize(storagePath, MAX_DOC_BYTES)
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf")
      const buffer = await readFileBuffer(storagePath)
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await extractPdf(pdf, { mergePages: true })
      return text || null
    }
    case "docx": {
      await assertExtractableSize(storagePath, MAX_DOC_BYTES)
      const mammoth = await import("mammoth")
      const { value } = await mammoth.extractRawText({ buffer: await readFileBuffer(storagePath) })
      return value || null
    }
    case "pptx": {
      await assertExtractableSize(storagePath, MAX_DOC_BYTES)
      const text = extractPptxText(new Uint8Array(await readFileBuffer(storagePath)))
      return text || null
    }
    case "xlsx": {
      await assertExtractableSize(storagePath, MAX_DOC_BYTES)
      const text = extractXlsxText(new Uint8Array(await readFileBuffer(storagePath)))
      return text || null
    }
    case "text": {
      const buffer = await readFileBuffer(storagePath)
      return truncateUtf8(buffer, MAX_TEXT_BYTES) || null
    }
    default:
      return null
  }
}
