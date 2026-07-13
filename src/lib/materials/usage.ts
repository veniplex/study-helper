import "server-only"
import { and, count, eq, sum } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSetting } from "@/lib/settings"

export type StorageUsage = { fileCount: number; totalBytes: number }

/** Total number of stored files and bytes a user occupies across all modules. */
export async function getUserStorage(userId: string): Promise<StorageUsage> {
  const [row] = await db
    .select({
      fileCount: count(material.id),
      totalBytes: sum(material.sizeBytes).mapWith(Number),
    })
    .from(material)
    .where(and(eq(material.userId, userId), eq(material.kind, "file")))
  return { fileCount: row?.fileCount ?? 0, totalBytes: row?.totalBytes ?? 0 }
}

/** The admin-configured per-user storage quota in bytes, or null for unlimited. */
export async function getStorageQuotaBytes(): Promise<number | null> {
  const uploads = await getSetting("uploads")
  const mb = uploads?.storageQuotaMbPerUser ?? 0
  return mb > 0 ? mb * 1024 * 1024 : null
}

/**
 * Throws if adding `addBytes` would push the user over the admin-configured
 * per-user storage quota. No-op when the quota is unlimited (0). This is a soft
 * cap: concurrent uploads can race slightly past the limit, which is acceptable
 * for a storage quota.
 */
export async function assertStorageWithinLimit(userId: string, addBytes: number): Promise<void> {
  const quota = await getStorageQuotaBytes()
  if (quota == null) return
  const { totalBytes } = await getUserStorage(userId)
  if (totalBytes + addBytes > quota) {
    throw new Error("Storage quota exceeded")
  }
}
