import { customType, index, integer, pgTable, text } from "drizzle-orm/pg-core"
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
  },
  (t) => [index("material_chunk_materialId_idx").on(t.materialId)]
)

export const materialChunkRelations = relations(materialChunk, ({ one }) => ({
  material: one(material, {
    fields: [materialChunk.materialId],
    references: [material.id],
  }),
}))
