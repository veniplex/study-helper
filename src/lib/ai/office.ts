/**
 * Pure text extractors for OOXML office files (PPTX/XLSX) built on `fflate`
 * unzip + light XML scraping — no server-only deps, so they're unit-testable.
 * DOCX is handled separately via `mammoth` in `extract.ts`.
 */
import { unzipSync } from "fflate"

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
}

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
}

/** Collects the text inside every `<tag>...</tag>` occurrence, decoded. */
function collectTagText(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, "gi")
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const text = decodeXml((m[1] ?? "").replace(/<[^>]+>/g, ""))
    if (text.trim()) out.push(text)
  }
  return out
}

const decoder = new TextDecoder()

/** Extracts slide text from a .pptx buffer (in slide order). */
export function extractPptxText(buffer: Uint8Array): string {
  const files = unzipSync(buffer)
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      return na - nb
    })
  const parts: string[] = []
  for (const name of slideNames) {
    const xml = decoder.decode(files[name])
    const texts = collectTagText(xml, "t")
    if (texts.length) parts.push(texts.join(" "))
  }
  return parts.join("\n\n")
}

/** Extracts text from a .xlsx buffer (shared strings + inline strings). */
export function extractXlsxText(buffer: Uint8Array): string {
  const files = unzipSync(buffer)
  const parts: string[] = []
  const shared = files["xl/sharedStrings.xml"]
  if (shared) parts.push(...collectTagText(decoder.decode(shared), "t"))
  // Inline strings that live directly in the sheets.
  for (const name of Object.keys(files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      parts.push(...collectTagText(decoder.decode(files[name]), "t"))
    }
  }
  return parts.join(" ")
}
