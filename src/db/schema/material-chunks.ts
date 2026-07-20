import { type AnyPgColumn, customType, index, integer, pgTable, text } from "drizzle-orm/pg-core"
import { relations, sql, type SQL } from "drizzle-orm"
import { material } from "./materials"

/**
 * Dimension-less pgvector column: embedding models differ in dimensionality
 * (768/1024/1536/3072), and at personal scale sequential cosine scan is fine.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector",
  toDriver: (value) => `[${value.join(",")}]`,
  fromDriver: (value) => JSON.parse(value as string) as number[],
})

/** Postgres full-text search vector (generated from `content`). */
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
})

export const materialChunk = pgTable(
  "material_chunk",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    materialId: text("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    /** "providerId:modelId" the embedding was created with */
    embeddingModel: text("embedding_model"),
    /**
     * Tree level: 0 = leaf chunk (raw material text), 1 = section summary,
     * 2 = document summary. Summary levels let generation see a map of the whole
     * corpus instead of only retrieved leaf chunks.
     */
    level: integer("level").notNull().default(0),
    /** For summary nodes: the chunk this node summarizes/rolls up from. */
    parentChunkId: text("parent_chunk_id").references((): AnyPgColumn => materialChunk.id, {
      onDelete: "set null",
    }),
    /**
     * Short context prefix (e.g. document title / section) prepended to the text
     * before embedding, to situate the chunk in its document (contextual
     * retrieval). Improves retrieval precision on ambiguous chunks.
     */
    contextualHeader: text("contextual_header"),
    /** Full-text search vector over `content`, for hybrid (lexical + vector)
     *  search. Uses the 'german' config (stemming + stop words) — the app's
     *  content is mostly German; English tokens still index as exact matches,
     *  and the vector leg of hybrid search covers English recall. Must match
     *  the query config in rag.ts. */
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('german', ${materialChunk.content})`
    ),
  },
  (t) => [
    index("material_chunk_materialId_idx").on(t.materialId),
    index("material_chunk_material_level_idx").on(t.materialId, t.level),
    index("material_chunk_tsv_idx").using("gin", t.contentTsv),
    // Required by the self-referencing FK: ON DELETE SET NULL makes Postgres run
    // "UPDATE … WHERE parent_chunk_id = $1" once per deleted row, which without
    // this index is a sequential scan of the whole (largest) table each time —
    // quadratic on every material delete and every re-chunk.
    index("material_chunk_parent_idx").on(t.parentChunkId),
  ]
)

export const materialChunkRelations = relations(materialChunk, ({ one }) => ({
  material: one(material, {
    fields: [materialChunk.materialId],
    references: [material.id],
  }),
}))
