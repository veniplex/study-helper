import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")

const TEXT_MIMES = ["text/", "application/json", "application/xml"]

/** Extracts plain text from a stored material file. Returns null if unsupported. */
export async function extractText(
  storagePath: string,
  mimeType: string | null
): Promise<string | null> {
  const abs = path.resolve(UPLOAD_DIR, storagePath)
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) throw new Error("Invalid path")

  if (mimeType === "application/pdf") {
    const { extractText: extractPdf, getDocumentProxy } = await import("unpdf")
    const buffer = await readFile(abs)
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractPdf(pdf, { mergePages: true })
    return text || null
  }

  if (mimeType && TEXT_MIMES.some((m) => mimeType.startsWith(m))) {
    return await readFile(abs, "utf8")
  }

  return null
}
