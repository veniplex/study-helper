import {
  type AnyPgColumn,
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"

export type MaterialKind = "file" | "link"

/**
 * A folder in a module's material tree. Self-referencing: `parentId` null means
 * a root-level folder. Sibling names are kept unique via a COALESCE expression
 * index added in the migration (Drizzle's `.unique()` treats NULL parents as
 * always-distinct, which would allow duplicate root folder names).
 */
export const materialFolder = pgTable(
  "material_folder",
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
    /** Parent folder, or null for a root-level folder. */
    parentId: text("parent_id").references((): AnyPgColumn => materialFolder.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("material_folder_userId_idx").on(t.userId),
    index("material_folder_moduleId_idx").on(t.moduleId),
    index("material_folder_parentId_idx").on(t.parentId),
  ]
)

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
    /**
     * @deprecated Legacy single-level folder name. Superseded by `folderId`
     * (real folder tree). Kept for backfill/rollback safety; drop in a later
     * migration once verified.
     */
    folder: text("folder"),
    /** The folder this material lives in, or null for the module root. */
    folderId: text("folder_id").references(() => materialFolder.id, { onDelete: "set null" }),
    /** Extracted plain text (any supported type) — basis for search and RAG. */
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
    index("material_folderId_idx").on(t.folderId),
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
  folder: one(materialFolder, {
    fields: [material.folderId],
    references: [materialFolder.id],
  }),
  annotations: many(materialAnnotation),
}))

export const materialFolderRelations = relations(materialFolder, ({ one, many }) => ({
  module: one(studyModule, {
    fields: [materialFolder.moduleId],
    references: [studyModule.id],
  }),
  parent: one(materialFolder, {
    fields: [materialFolder.parentId],
    references: [materialFolder.id],
    relationName: "folderTree",
  }),
  children: many(materialFolder, { relationName: "folderTree" }),
  materials: many(material),
}))

export const materialAnnotationRelations = relations(materialAnnotation, ({ one }) => ({
  material: one(material, {
    fields: [materialAnnotation.materialId],
    references: [material.id],
  }),
}))
