import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { getSetting, setSetting } from "@/lib/settings"

// Optional pgvector HNSW ANN index. The base `material_chunk.embedding` column
// is deliberately dimension-less (so different embedding models can coexist),
// which pgvector cannot index. This module maintains a typed shadow column
// `embedding_hnsw vector(N)` + an HNSW index for the *active* embedding model,
// built on demand by an admin. Everything here is additive and opt-in: unless
// an admin has built the index, `annDimensionFor` returns null and search keeps
// using the sequential cosine scan (unchanged default).

const ANN_COLUMN = "embedding_hnsw"
const ANN_INDEX = "material_chunk_hnsw_idx"

/**
 * The ANN dimension to use for this embedding model, or null when the ANN index
 * isn't ready for it (callers then fall back to the dimensionless scan).
 */
export async function annDimensionFor(embeddingRef: string): Promise<number | null> {
  const ann = await getSetting("ai.ann")
  if (!ann || ann.status !== "ready" || ann.embeddingModel !== embeddingRef || !ann.dimensions) {
    return null
  }
  return ann.dimensions
}

/** Populates the ANN column for a material's freshly-embedded chunks. No-op
 *  unless the ANN index is ready for the active model. */
export async function populateAnn(materialId: string, embeddingRef: string): Promise<void> {
  const dim = await annDimensionFor(embeddingRef)
  if (!dim) return
  try {
    await db.execute(sql`
      UPDATE material_chunk
      SET ${sql.raw(ANN_COLUMN)} = embedding::text::vector(${sql.raw(String(dim))})
      WHERE material_id = ${materialId}
        AND embedding_model = ${embeddingRef}
        AND embedding IS NOT NULL
        AND ${sql.raw(ANN_COLUMN)} IS NULL
    `)
  } catch (error) {
    // ANN is best-effort; a failure here must not break ingestion.
    console.error("[ann] populate failed", materialId, error)
  }
}

/**
 * (Re)builds the HNSW ANN index for the active embedding model. Heavy — runs in
 * the background. Infers the embedding dimension from stored data, rebuilds the
 * typed column + index from `embedding` (the source of truth), and records the
 * result in the `ai.ann` setting. On any failure the state is marked `failed`
 * and search continues on the sequential scan.
 */
export async function reindexVectors(): Promise<void> {
  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel
  if (!embeddingRef) {
    await setSetting("ai.ann", { status: "failed", error: "No embedding model configured" })
    return
  }
  await setSetting("ai.ann", { status: "building", embeddingModel: embeddingRef })
  try {
    const dimRows = await db.execute<{ dim: number }>(sql`
      SELECT vector_dims(embedding) AS dim
      FROM material_chunk
      WHERE embedding_model = ${embeddingRef} AND embedding IS NOT NULL
      LIMIT 1
    `)
    const dim = Number(dimRows[0]?.dim)
    if (!Number.isInteger(dim) || dim <= 0) {
      await setSetting("ai.ann", {
        status: "failed",
        embeddingModel: embeddingRef,
        error: "No embeddings found for the active model yet",
      })
      return
    }
    const dimLit = sql.raw(String(dim))
    // Rebuild from scratch so a model/dimension change is handled cleanly.
    await db.execute(sql`DROP INDEX IF EXISTS ${sql.raw(ANN_INDEX)}`)
    await db.execute(sql`ALTER TABLE material_chunk DROP COLUMN IF EXISTS ${sql.raw(ANN_COLUMN)}`)
    await db.execute(
      sql`ALTER TABLE material_chunk ADD COLUMN ${sql.raw(ANN_COLUMN)} vector(${dimLit})`
    )
    await db.execute(sql`
      UPDATE material_chunk
      SET ${sql.raw(ANN_COLUMN)} = embedding::text::vector(${dimLit})
      WHERE embedding_model = ${embeddingRef} AND embedding IS NOT NULL
    `)
    await db.execute(
      sql`CREATE INDEX ${sql.raw(ANN_INDEX)} ON material_chunk USING hnsw (${sql.raw(ANN_COLUMN)} vector_cosine_ops)`
    )
    await setSetting("ai.ann", { status: "ready", embeddingModel: embeddingRef, dimensions: dim })
  } catch (error) {
    console.error("[ann] reindex failed", error)
    await setSetting("ai.ann", {
      status: "failed",
      embeddingModel: embeddingRef,
      error: error instanceof Error ? error.message.slice(0, 500) : "reindex failed",
    })
  }
}
