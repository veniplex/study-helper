import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { getSetting, setSetting } from "@/lib/settings"
import { processMaterial } from "./rag"

/**
 * Re-embeds every material whose chunks were embedded with a different model
 * than the active `ai.defaultEmbeddingModel`. Without this, changing the
 * embedding model silently orphans all existing chunks: vector search filters
 * on the active model ref and matches nothing.
 *
 * Resumable/best-effort: `processMaterial` reuses the stored extracted text
 * (no re-OCR cost) and skips chunks already embedded for the active model; a
 * failed material is counted and skipped rather than aborting the batch.
 * Progress is tracked in the `ai.reembed` setting for the admin UI.
 */
export async function reembedStaleMaterials(): Promise<void> {
  const ai = await getSetting("ai")
  const ref = ai?.defaultEmbeddingModel
  if (!ref) {
    await setSetting("ai.reembed", { status: "failed", error: "No embedding model configured" })
    return
  }

  const staleIds = await findStaleMaterialIds(ref)
  if (staleIds.length === 0) {
    await setSetting("ai.reembed", { status: "done", embeddingModel: ref, total: 0, done: 0 })
    return
  }

  let done = 0
  let failed = 0
  const progress = () =>
    setSetting("ai.reembed", {
      status: "running",
      embeddingModel: ref,
      total: staleIds.length,
      done,
      failed,
    })
  await progress()

  for (const materialId of staleIds) {
    // Abort (and leave state resumable) when an admin changes the model again
    // mid-run — the auto-enqueue on save starts a fresh backfill.
    const current = (await getSetting("ai"))?.defaultEmbeddingModel
    if (current !== ref) {
      await setSetting("ai.reembed", {
        status: "failed",
        embeddingModel: ref,
        total: staleIds.length,
        done,
        failed,
        error: "Embedding model changed mid-run — restart the re-embed.",
      })
      return
    }

    try {
      await processMaterial(materialId)
      // Old-model chunks would still surface as duplicate lexical (FTS) hits —
      // remove them only after the new embedding succeeded, so search never
      // loses content mid-backfill.
      await db.execute(sql`
        DELETE FROM material_chunk
        WHERE material_id = ${materialId}
          AND embedding_model IS DISTINCT FROM ${ref}
      `)
      const { enqueueSummarizeMaterial } = await import("@/lib/jobs")
      await enqueueSummarizeMaterial(materialId)
      done++
    } catch (error) {
      console.error("[reembed] material failed", materialId, error)
      failed++
    }
    await progress()
  }

  await setSetting("ai.reembed", {
    status: "done",
    embeddingModel: ref,
    total: staleIds.length,
    done,
    failed,
  })

  // The HNSW ANN shadow column (if ever built) is typed for the old model's
  // dimension — rebuild it for the new one now that the chunk set is final.
  const ann = await getSetting("ai.ann")
  if (ann && ann.status !== "idle") {
    const { enqueueReindexVectors } = await import("@/lib/jobs")
    await enqueueReindexVectors()
  }
}

/** Materials that still have chunks embedded with a non-active model. */
export async function findStaleMaterialIds(activeRef: string): Promise<string[]> {
  const rows = await db.execute<{ material_id: string }>(sql`
    SELECT DISTINCT material_id
    FROM material_chunk
    WHERE embedding_model IS DISTINCT FROM ${activeRef}
  `)
  return rows.map((r) => r.material_id)
}

/** Count for the admin banner ("N materials need re-embedding"). */
export async function countStaleMaterials(activeRef: string): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT count(DISTINCT material_id)::int AS count
    FROM material_chunk
    WHERE embedding_model IS DISTINCT FROM ${activeRef}
  `)
  return Number(rows[0]?.count ?? 0)
}
