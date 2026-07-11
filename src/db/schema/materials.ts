import { bigint, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
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

/** Rectangle in normalized page coordinates (0–1, origin top-left). */
export type AnnotationRect = { x: number; y: number; w: number; h: number }

export type AnnotationColor = "yellow" | "green" | "red" | "blue"

/** Highlight/note annotations on a PDF material, one row per marked area. */
export const materialAnnotation = pgTable(
  "material_annotation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    materialId: text("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 1-based PDF page number. */
    page: integer("page").notNull(),
    rect: jsonb("rect").$type<AnnotationRect>().notNull(),
    color: text("color").$type<AnnotationColor>().notNull().default("yellow"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("material_annotation_material_idx").on(t.materialId)]
)

export const materialRelations = relations(material, ({ one, many }) => ({
  module: one(studyModule, {
    fields: [material.moduleId],
    references: [studyModule.id],
  }),
  annotations: many(materialAnnotation),
}))

export const materialAnnotationRelations = relations(materialAnnotation, ({ one }) => ({
  material: one(material, {
    fields: [materialAnnotation.materialId],
    references: [material.id],
  }),
}))
