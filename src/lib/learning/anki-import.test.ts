import { describe, expect, it } from "vitest"
import path from "node:path"
import { zipSync } from "fflate"
import { parseApkg } from "./anki-import"

async function buildApkg(notes: string[][]): Promise<Buffer> {
  const initSqlJs = (await import("sql.js")).default
  const SQL = await initSqlJs({
    locateFile: (f: string) => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
  })
  const db = new SQL.Database()
  db.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT)")
  for (const fields of notes) {
    db.run("INSERT INTO notes (flds) VALUES (?)", [fields.join("\x1f")])
  }
  const bytes = db.export()
  db.close()
  return Buffer.from(zipSync({ "collection.anki2": bytes }))
}

describe("parseApkg", () => {
  it("extracts front/back from note fields and strips HTML", async () => {
    const apkg = await buildApkg([
      ["<b>Was ist O(n log n)?</b>", "Laufzeit von <i>Mergesort</i><br>und Heapsort"],
      ["Frage 2", "Antwort 2 [sound:audio.mp3]"],
    ])
    const cards = await parseApkg(apkg)
    expect(cards).toEqual([
      { front: "Was ist O(n log n)?", back: "Laufzeit von Mergesort\nund Heapsort" },
      { front: "Frage 2", back: "Antwort 2" },
    ])
  })

  it("skips notes without two usable fields", async () => {
    const apkg = await buildApkg([["nur front"], ["front", "back"]])
    const cards = await parseApkg(apkg)
    expect(cards).toHaveLength(1)
  })

  it("rejects the new zstd format with a helpful error", async () => {
    const zipped = Buffer.from(zipSync({ "collection.anki21b": new Uint8Array([1, 2, 3]) }))
    await expect(parseApkg(zipped)).rejects.toThrow(/older Anki versions/)
  })
})
