import path from "node:path"
import { unzipSync } from "fflate"

export type AnkiCard = { front: string; back: string }

/** Strips Anki's HTML markup down to readable plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Extracts cards from an Anki .apkg export (a zip containing an SQLite
 * collection). Reads the notes' first two fields as front/back; media files
 * are ignored. Exports using the newer .anki21b (zstd) format are rejected —
 * Anki offers "legacy" export for those.
 */
export async function parseApkg(buffer: Buffer, limit = 2000): Promise<AnkiCard[]> {
  const files = unzipSync(new Uint8Array(buffer))
  const dbFile = files["collection.anki21"] ?? files["collection.anki2"]
  if (!dbFile) {
    if (files["collection.anki21b"]) {
      throw new Error(
        'This .apkg uses Anki\'s new format. In Anki, export with "Support older Anki versions" enabled.'
      )
    }
    throw new Error("No Anki collection found in this file.")
  }

  const initSqlJs = (await import("sql.js")).default
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  })
  const db = new SQL.Database(dbFile)
  try {
    const result = db.exec(`SELECT flds FROM notes LIMIT ${limit}`)
    const rows = result[0]?.values ?? []
    const cards: AnkiCard[] = []
    for (const [flds] of rows) {
      // Anki separates note fields with \x1f
      const fields = String(flds).split("\x1f")
      const front = htmlToText(fields[0] ?? "")
      const back = htmlToText(fields.slice(1).join("\n\n"))
      if (front && back) cards.push({ front: front.slice(0, 4000), back: back.slice(0, 4000) })
    }
    return cards
  } finally {
    db.close()
  }
}
