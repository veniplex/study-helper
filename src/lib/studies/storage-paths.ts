/** The stored-file columns a material can own on disk. */
export type MaterialPaths = { storagePath: string | null; textStoragePath: string | null }

/**
 * Flattens a set of material rows into the list of storage objects they own —
 * both the original file blob and the extracted-text blob. Pure and DB-free so
 * the collection logic is unit-testable; the DB query lives in `orphan-cleanup`.
 */
export function collectStoragePaths(rows: MaterialPaths[]): string[] {
  const paths: string[] = []
  for (const row of rows) {
    if (row.storagePath) paths.push(row.storagePath)
    if (row.textStoragePath) paths.push(row.textStoragePath)
  }
  return paths
}
