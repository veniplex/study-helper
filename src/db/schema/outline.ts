import {
  type AnyPgColumn,
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

export type OutlineStatus = "idle" | "building" | "ready" | "failed"

/**
 * One row per module tracking its topic outline: the current version and a
 * fingerprint over the module's material set, so the (expensive) outline is
 * only rebuilt when the materials actually changed — new requests reuse it.
 */
export const moduleOutline = pgTable("module_outline", {
  moduleId: text("module_id")
    .primaryKey()
    .references(() => studyModule.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(0),
  /** Hash over the module's ready materials (content hashes) at build time. */
  fingerprint: text("fingerprint"),
  status: text("status").$type<OutlineStatus>().notNull().default("idle"),
  topicCount: integer("topic_count").notNull().default(0),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * A topic in a module's outline — the unit of coverage-driven generation. The
 * whole material corpus is distilled into these topics so generation can iterate
 * over ALL of them (complete coverage) instead of a single top-k retrieval.
 */
export const outlineTopic = pgTable(
  "outline_topic",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Outline version this topic belongs to. */
    version: integer("version").notNull(),
    /** Optional parent topic (for subtopics). */
    parentId: text("parent_id").references((): AnyPgColumn => outlineTopic.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    /** Normalized title, used to carry topic identity across rebuilds (reuse). */
    titleKey: text("title_key").notNull(),
    summary: text("summary"),
    /** Ids of the materials that back this topic (for grounding retrieval). */
    sourceMaterialIds: jsonb("source_material_ids").$type<string[]>().notNull().default([]),
    /** Relative importance / share of the corpus (1–10). */
    weight: integer("weight").notNull().default(5),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outline_topic_module_idx").on(t.moduleId),
    index("outline_topic_module_version_idx").on(t.moduleId, t.version),
  ]
)

export const moduleOutlineRelations = relations(moduleOutline, ({ one }) => ({
  module: one(studyModule, {
    fields: [moduleOutline.moduleId],
    references: [studyModule.id],
  }),
}))

export const outlineTopicRelations = relations(outlineTopic, ({ one }) => ({
  module: one(studyModule, {
    fields: [outlineTopic.moduleId],
    references: [studyModule.id],
  }),
}))
