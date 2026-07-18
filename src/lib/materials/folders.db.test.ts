/**
 * DB-backed integration tests for the folder helpers. Skipped unless
 * RUN_DB_TESTS=1 and DATABASE_URL point at a migrated Postgres — CI without a
 * database stays green. Run locally with:
 *   RUN_DB_TESTS=1 DATABASE_URL=postgres://study@localhost:5432/study \
 *     npx vitest run src/lib/materials/folders.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const RUN = process.env.RUN_DB_TESTS === "1"

describe.skipIf(!RUN)("folder helpers (DB)", () => {
  let db: typeof import("@/db").db
  let schema: typeof import("@/db/schema")
  let folders: typeof import("./folders")
  const uid = "itest-user"
  const mid = "itest-module"

  beforeAll(async () => {
    db = (await import("@/db")).db
    schema = await import("@/db/schema")
    folders = await import("./folders")
    // Seed the FK chain: user -> program -> semester -> module.
    await db.insert(schema.user).values({ id: uid, name: "IT", email: "it@x.de", emailVerified: true }).onConflictDoNothing()
    await db.insert(schema.degreeProgram).values({ id: "itest-prog", userId: uid, name: "P", gradingSystem: "german", sortOrder: 0, thesisMaxAttempts: 1 }).onConflictDoNothing()
    await db.insert(schema.semester).values({ id: "itest-sem", programId: "itest-prog", name: "S", sortOrder: 0 }).onConflictDoNothing()
    await db.insert(schema.studyModule).values({ id: mid, semesterId: "itest-sem", name: "M", status: "active", sortOrder: 0 }).onConflictDoNothing()
  })

  afterAll(async () => {
    if (RUN) await db.delete(schema.user).where((await import("drizzle-orm")).eq(schema.user.id, uid))
  })

  it("creates a nested path and dedups on repeat", async () => {
    const first = await folders.findOrCreateFolderPath(uid, mid, ["A", "B", "C"])
    expect(first).toBeTruthy()
    // Same path again returns the same deepest folder (no duplicates).
    const second = await folders.findOrCreateFolderPath(uid, mid, ["A", "B", "C"])
    expect(second).toBe(first)
    const all = await db.query.materialFolder.findMany({
      where: (await import("drizzle-orm")).eq(schema.materialFolder.moduleId, mid),
    })
    expect(all.length).toBe(3) // A, B, C — not 6
  })

  it("computes subtree stats, subtree collection and descendant guard", async () => {
    const a = await folders.findOrCreateFolderPath(uid, mid, ["A"])
    const c = await folders.findOrCreateFolderPath(uid, mid, ["A", "B", "C"])
    // Put a file directly in C.
    await db.insert(schema.material).values({ id: "itest-mat", userId: uid, moduleId: mid, kind: "file", name: "f", sizeBytes: 500, folderId: c })

    const stats = await folders.folderStats(mid)
    expect(stats.get(a!)?.fileCount).toBe(1)
    expect(stats.get(a!)?.sizeBytes).toBe(500)
    expect(stats.get(c!)?.fileCount).toBe(1)

    const sub = await folders.collectFolderSubtree(a!)
    expect(sub.folderIds).toContain(c)
    expect(sub.materials.map((m) => m.id)).toContain("itest-mat")

    expect(await folders.isDescendant(a!, c!)).toBe(true) // C is under A
    expect(await folders.isDescendant(c!, a!)).toBe(false) // A is not under C
  })
})
