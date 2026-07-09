import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"

export type MaterialKind = "file" | "link"

export const material = pgTable(
  "material",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MaterialKind>().notNull(),
    name: text("name").notNull(),
    /** For kind=link */
    url: text("url"),
    /** For kind=file: relative path inside the upload dir */
    storagePath: text("storage_path"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    folder: text("folder"),
    /** Extracted plain text (PDF/PPTX) — basis for search and RAG. */
    textContent: text("text_content"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("material_userId_idx").on(t.userId),
    index("material_moduleId_idx").on(t.moduleId),
  ]
)

export const materialRelations = relations(material, ({ one }) => ({
  module: one(studyModule, {
    fields: [material.moduleId],
    references: [studyModule.id],
  }),
}))
