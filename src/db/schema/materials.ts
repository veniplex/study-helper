import {
  type AnyPgColumn,
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"

export type MaterialKind = "file" | "link"

/**
 * Lifecycle of a material's text extraction + embedding pipeline. Lets the UI
 * show progress and lets the pipeline resume/skip already-processed materials.
 */
export type ExtractionStatus =
  "pending" | "extracting" | "embedding" | "summarizing" | "ready" | "failed" | "skipped"

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
    // Sibling names are unique per module; COALESCE folds NULL parents into one
    // group so root folders are covered too (a plain .unique() would treat NULL
    // as always-distinct). Mirrors migration 0029_serious_magma.sql.
    uniqueIndex("material_folder_sibling_uniq").on(
      t.moduleId,
      sql`COALESCE(${t.parentId}, '')`,
      t.name
    ),
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
    /**
     * Bounded preview of the extracted plain text (kept small for quick ILIKE
     * search). The full extracted text lives on disk at `textStoragePath` so
     * multi-GB documents are not capped by a single DB column.
     */
    textContent: text("text_content"),
    /** Relative path (inside the upload dir) to the full extracted plain text. */
    textStoragePath: text("text_storage_path"),
    /** Length in characters of the full extracted text. */
    charCount: integer("char_count"),
    /** sha256 of the file bytes — used to skip re-processing unchanged content. */
    contentHash: text("content_hash"),
    /** AI-generated document-level summary (basis for the module outline). */
    summary: text("summary"),
    /** Text extraction + embedding lifecycle state. */
    extractionStatus: text("extraction_status")
      .$type<ExtractionStatus>()
      .notNull()
      .default("pending"),
    /** Last extraction/embedding error message, if any. */
    extractionError: text("extraction_error"),
    /** Total number of leaf chunks for this material (null until chunked). */
    chunksTotal: integer("chunks_total"),
    /** Number of leaf chunks already embedded (for resumable/progress display). */
    chunksEmbedded: integer("chunks_embedded"),
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
    index("material_contentHash_idx").on(t.userId, t.contentHash),
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
