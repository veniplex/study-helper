/**
 * DB + disk integration test for zip unpacking. Skipped unless RUN_DB_TESTS=1
 * with a migrated Postgres and a writable UPLOAD_DIR. Run with:
 *   RUN_DB_TESTS=1 DATABASE_URL=postgres://study@localhost:5432/study \
 *     UPLOAD_DIR=/tmp/shpg-uploads npx vitest run src/lib/jobs/unpack-zip.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { zipSync, strToU8 } from "fflate"

vi.mock("server-only", () => ({}))
const enqueueEmbedMaterial = vi.fn()
vi.mock("@/lib/jobs", () => ({ enqueueEmbedMaterial }))

const RUN = process.env.RUN_DB_TESTS === "1"

describe.skipIf(!RUN)("unpackZip (DB + disk)", () => {
  let db: typeof import("@/db").db
  let schema: typeof import("@/db/schema")
  let storage: typeof import("@/lib/storage")
  let unpack: typeof import("./unpack-zip")
  let eq: typeof import("drizzle-orm").eq
  let and: typeof import("drizzle-orm").and
  const uid = "zip-user"
  const mid = "zip-module"

  beforeAll(async () => {
    ;({ db } = await import("@/db"))
    schema = await import("@/db/schema")
    storage = await import("@/lib/storage")
    unpack = await import("./unpack-zip")
    ;({ eq, and } = await import("drizzle-orm"))
    await db.insert(schema.user).values({ id: uid, name: "Z", email: "z@x.de", emailVerified: true }).onConflictDoNothing()
    await db.insert(schema.degreeProgram).values({ id: "zip-prog", userId: uid, name: "P", gradingSystem: "german", sortOrder: 0, thesisMaxAttempts: 1 }).onConflictDoNothing()
    await db.insert(schema.semester).values({ id: "zip-sem", programId: "zip-prog", name: "S", sortOrder: 0 }).onConflictDoNothing()
    await db.insert(schema.studyModule).values({ id: mid, semesterId: "zip-sem", name: "M", status: "active", sortOrder: 0 }).onConflictDoNothing()
  })

  afterAll(async () => {
    if (RUN) await db.delete(schema.user).where(eq(schema.user.id, uid))
  })

  it("expands a nested zip into the folder tree and discards the archive", async () => {
    const zipBytes = zipSync({
      "notes.txt": strToU8("root note"),
      "src/main.py": strToU8("print('hi')"),
      "src/util/helpers.py": strToU8("x = 1"),
      "__MACOSX/ignore": strToU8("junk"),
      "../evil.txt": strToU8("nope"),
    })
    const zipPath = await storage.saveFile(uid, "myproject.zip", Buffer.from(zipBytes))

    await unpack.unpackZip({ userId: uid, moduleId: mid, parentFolderId: null, zipStoragePath: zipPath, zipName: "myproject.zip" })

    // Folder tree: myproject -> src -> util
    const allFolders = await db.query.materialFolder.findMany({ where: eq(schema.materialFolder.moduleId, mid) })
    const byName = Object.fromEntries(allFolders.map((f) => [f.name, f]))
    expect(byName["myproject"]).toBeTruthy()
    expect(byName["src"]?.parentId).toBe(byName["myproject"].id)
    expect(byName["util"]?.parentId).toBe(byName["src"].id)

    // Materials placed in the right folders; zip-slip + __MACOSX skipped.
    const mats = await db.query.material.findMany({ where: and(eq(schema.material.moduleId, mid), eq(schema.material.userId, uid)) })
    const names = mats.map((m) => m.name).sort()
    expect(names).toEqual(["helpers.py", "main.py", "notes.txt"]) // evil.txt + __MACOSX skipped
    const helpers = mats.find((m) => m.name === "helpers.py")!
    expect(helpers.folderId).toBe(byName["util"].id)
    const rootNote = mats.find((m) => m.name === "notes.txt")!
    expect(rootNote.folderId).toBe(byName["myproject"].id)

    // Each extracted file was queued for embedding.
    expect(enqueueEmbedMaterial).toHaveBeenCalledTimes(3)

    // The temporary archive blob is gone.
    await expect(storage.fileSize(zipPath)).rejects.toThrow()
  })
})
