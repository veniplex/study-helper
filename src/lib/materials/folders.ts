import "server-only"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import { material, materialFolder } from "@/db/schema"
import { sanitizeSegment } from "./paths"

export { sanitizeSegment, splitPath } from "./paths"

/** Throws if the folder does not belong to the user. Returns the folder row. */
export async function ownFolder(folderId: string, userId: string) {
  const row = await db.query.materialFolder.findFirst({
    where: and(eq(materialFolder.id, folderId), eq(materialFolder.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

/**
 * Walks (creating as needed) a chain of folder segments under `parentId`,
 * returning the id of the deepest folder — or `parentId` when there are no
 * segments. Sibling lookups use the same COALESCE-unique key as the DB index,
 * so concurrent creates converge on the existing row instead of duplicating.
 */
export async function findOrCreateFolderPath(
  userId: string,
  moduleId: string,
  segments: string[],
  parentId: string | null = null
): Promise<string | null> {
  let current = parentId
  for (const raw of segments) {
    const name = sanitizeSegment(raw)
    if (!name) continue
    const existing = await db.query.materialFolder.findFirst({
      where: and(
        eq(materialFolder.moduleId, moduleId),
        current == null ? isNull(materialFolder.parentId) : eq(materialFolder.parentId, current),
        eq(materialFolder.name, name)
      ),
    })
    if (existing) {
      current = existing.id
      continue
    }
    try {
      const [created] = await db
        .insert(materialFolder)
        .values({ userId, moduleId, parentId: current, name })
        .returning({ id: materialFolder.id })
      // insert().returning() yields exactly one row unless it throws — and a
      // throw is exactly what the catch below handles (lost creation race).
      current = created!.id
    } catch {
      // Lost a race to a concurrent create — read back the winning row.
      const raced = await db.query.materialFolder.findFirst({
        where: and(
          eq(materialFolder.moduleId, moduleId),
          current == null ? isNull(materialFolder.parentId) : eq(materialFolder.parentId, current),
          eq(materialFolder.name, name)
        ),
      })
      if (!raced) throw new Error("Failed to create folder")
      current = raced.id
    }
  }
  return current
}

type SubtreeRow = { id: string }
type SubtreeMaterial = { id: string; storagePath: string | null }

/**
 * Gathers a folder and all its descendant folders plus every material within
 * the subtree, via a recursive CTE. Used for recursive delete and stats.
 */
export async function collectFolderSubtree(
  folderId: string
): Promise<{ folderIds: string[]; materials: SubtreeMaterial[] }> {
  const folders = await db.execute<SubtreeRow>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM ${materialFolder} WHERE id = ${folderId}
      UNION ALL
      SELECT f.id FROM ${materialFolder} f
      JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  `)
  const folderIds = folders.map((r) => r.id)
  if (folderIds.length === 0) return { folderIds: [], materials: [] }
  const mats = await db
    .select({ id: material.id, storagePath: material.storagePath })
    .from(material)
    .where(inArray(material.folderId, folderIds))
  return { folderIds, materials: mats }
}

/**
 * True if `maybeAncestorId` is `folderId` itself or one of its ancestors —
 * i.e. moving `maybeDescendant` under `folderId` would create a cycle. Used to
 * guard folder moves.
 */
export async function isDescendant(folderId: string, maybeAncestorId: string): Promise<boolean> {
  if (folderId === maybeAncestorId) return true
  const rows = await db.execute<SubtreeRow>(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM ${materialFolder} WHERE id = ${folderId}
      UNION ALL
      SELECT f.id FROM ${materialFolder} f
      JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree WHERE id = ${maybeAncestorId}
  `)
  return rows.length > 0
}

export type FolderStats = { folderId: string; fileCount: number; sizeBytes: number }

/**
 * Per-folder aggregate over the whole subtree of each folder in a module:
 * total number of files and total bytes contained (including nested folders).
 * Subfolder counts are derived cheaply on the client from the folder list.
 */
export async function folderStats(moduleId: string): Promise<Map<string, FolderStats>> {
  const rows = await db.execute<{
    folderId: string
    fileCount: number
    sizeBytes: number
  }>(sql`
    WITH RECURSIVE tree AS (
      -- each folder is the root of its own subtree
      SELECT id AS root, id AS node FROM ${materialFolder} WHERE module_id = ${moduleId}
      UNION ALL
      SELECT t.root, f.id
      FROM ${materialFolder} f
      JOIN tree t ON f.parent_id = t.node
    )
    SELECT t.root AS "folderId",
           COUNT(m.id)::int AS "fileCount",
           COALESCE(SUM(m.size_bytes), 0)::bigint AS "sizeBytes"
    FROM tree t
    LEFT JOIN ${material} m ON m.folder_id = t.node AND m.kind = 'file'
    GROUP BY t.root
  `)
  const map = new Map<string, FolderStats>()
  for (const r of rows) {
    map.set(r.folderId, {
      folderId: r.folderId,
      fileCount: Number(r.fileCount),
      sizeBytes: Number(r.sizeBytes),
    })
  }
  return map
}
