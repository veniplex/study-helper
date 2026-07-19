import "server-only"
import { inArray } from "drizzle-orm"
import { db } from "@/db"
import { material, semester, studyModule } from "@/db/schema"
import { collectStoragePaths } from "./storage-paths"

export { collectStoragePaths } from "./storage-paths"

/** All storage paths owned by materials under the given modules. */
async function pathsForModules(moduleIds: string[]): Promise<string[]> {
  if (moduleIds.length === 0) return []
  const rows = await db.query.material.findMany({
    where: inArray(material.moduleId, moduleIds),
    columns: { storagePath: true, textStoragePath: true },
  })
  return collectStoragePaths(rows)
}

/** Module ids under a semester. */
async function moduleIdsForSemester(semesterId: string): Promise<string[]> {
  const rows = await db.query.studyModule.findMany({
    where: inArray(studyModule.semesterId, [semesterId]),
    columns: { id: true },
  })
  return rows.map((r) => r.id)
}

/** Module ids under a whole program (across all its semesters). */
async function moduleIdsForProgram(programId: string): Promise<string[]> {
  const sems = await db.query.semester.findMany({
    where: inArray(semester.programId, [programId]),
    columns: { id: true },
  })
  const semesterIds = sems.map((s) => s.id)
  if (semesterIds.length === 0) return []
  const rows = await db.query.studyModule.findMany({
    where: inArray(studyModule.semesterId, semesterIds),
    columns: { id: true },
  })
  return rows.map((r) => r.id)
}

/**
 * Enqueues deletion of every storage object owned by materials in a
 * program/semester/module subtree. MUST be called BEFORE the DB cascade delete
 * removes the material rows — afterwards the paths are unrecoverable. The actual
 * unlink runs in the `sweep-orphan-files` background job (bounded + crash-safe:
 * a retry that finds a file already gone is a no-op). A leak in the crash window
 * between row-delete and enqueue is harmless (the blob is simply orphaned).
 */
export async function sweepModuleFiles(moduleId: string): Promise<void> {
  await enqueuePaths(await pathsForModules([moduleId]))
}

export async function sweepSemesterFiles(semesterId: string): Promise<void> {
  await enqueuePaths(await pathsForModules(await moduleIdsForSemester(semesterId)))
}

export async function sweepProgramFiles(programId: string): Promise<void> {
  await enqueuePaths(await pathsForModules(await moduleIdsForProgram(programId)))
}

async function enqueuePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { enqueueSweepOrphanFiles } = await import("@/lib/jobs")
  await enqueueSweepOrphanFiles(paths)
}
