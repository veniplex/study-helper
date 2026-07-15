import { type AnyPgColumn, customType, index, integer, pgTable, text } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
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
  },
  (t) => [
    index("material_chunk_materialId_idx").on(t.materialId),
    index("material_chunk_material_level_idx").on(t.materialId, t.level),
  ]
)

export const materialChunkRelations = relations(materialChunk, ({ one }) => ({
  material: one(material, {
    fields: [materialChunk.materialId],
    references: [material.id],
  }),
}))
