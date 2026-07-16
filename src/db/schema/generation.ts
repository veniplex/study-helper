import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"
import { outlineTopic } from "./outline"

export type GenerationKind = "deck" | "quiz"
export type GenerationJobStatus = "pending" | "running" | "completed" | "failed" | "canceled"
export type CoverageStatus = "pending" | "generating" | "done" | "failed"

/**
 * A coverage-driven generation run: fills a deck/quiz by iterating over ALL
 * outline topics of a module. Tracks progress (topics done / total, items
 * produced) so the UI can show real completeness and the run is resumable.
 */
export const generationJob = pgTable(
  "generation_job",
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
    kind: text("kind").$type<GenerationKind>().notNull(),
    /** Deck or quiz id being filled. */
    targetId: text("target_id").notNull(),
    status: text("status").$type<GenerationJobStatus>().notNull().default("pending"),
    outlineVersion: integer("outline_version"),
    topicsTotal: integer("topics_total").notNull().default(0),
    topicsDone: integer("topics_done").notNull().default(0),
    producedCount: integer("produced_count").notNull().default(0),
    params: jsonb("params"),
    /** When the MAP step ran via a provider Batch API: the vendor batch id
     *  (while awaiting results) and the "providerId:modelId" it was submitted
     *  with (so a poller can resolve credentials and record usage). Both null
     *  for the default synchronous live path. */
    batchRef: text("batch_ref"),
    batchModel: text("batch_model"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("generation_job_user_idx").on(t.userId),
    index("generation_job_target_idx").on(t.targetId),
  ]
)

/**
 * Per-(target, topic) coverage record. Keyed to the target (deck/quiz) rather
 * than a single run, so a later "complete" request reuses what was already
 * generated and only produces material for new/uncovered topics.
 */
export const generationCoverage = pgTable(
  "generation_coverage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    targetId: text("target_id").notNull(),
    topicId: text("topic_id")
      .notNull()
      .references(() => outlineTopic.id, { onDelete: "cascade" }),
    /** The job that last produced/updated this coverage. */
    jobId: text("job_id").references(() => generationJob.id, { onDelete: "set null" }),
    status: text("status").$type<CoverageStatus>().notNull().default("pending"),
    producedCount: integer("produced_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("generation_coverage_target_topic_idx").on(t.targetId, t.topicId),
    index("generation_coverage_job_idx").on(t.jobId),
  ]
)

export const generationJobRelations = relations(generationJob, ({ one, many }) => ({
  module: one(studyModule, {
    fields: [generationJob.moduleId],
    references: [studyModule.id],
  }),
  coverage: many(generationCoverage),
}))

export const generationCoverageRelations = relations(generationCoverage, ({ one }) => ({
  job: one(generationJob, {
    fields: [generationCoverage.jobId],
    references: [generationJob.id],
  }),
  topic: one(outlineTopic, {
    fields: [generationCoverage.topicId],
    references: [outlineTopic.id],
  }),
}))
