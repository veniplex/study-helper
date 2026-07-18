import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { generationCoverage, generationJob } from "@/db/schema"

/**
 * generationJob.targetId / generationCoverage.targetId point polymorphically at
 * a deck OR a quiz, so Postgres can't cascade them. Call this when deleting the
 * target so job/coverage rows don't linger as orphans.
 */
export async function deleteGenerationDataForTarget(targetId: string): Promise<void> {
  await db.delete(generationCoverage).where(eq(generationCoverage.targetId, targetId))
  await db.delete(generationJob).where(eq(generationJob.targetId, targetId))
}
