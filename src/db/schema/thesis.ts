import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import { user } from "./auth"
import { degreeProgram, semester } from "./studies"

export type ThesisPhase = "topic" | "exposé" | "research" | "writing" | "revision" | "submitted"

export const thesisProject = pgTable(
  "thesis_project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    programId: text("program_id").references(() => degreeProgram.id, { onDelete: "cascade" }),
    semesterId: text("semester_id").references(() => semester.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    thesisType: text("thesis_type"), // Bachelor, Master, ...
    phase: text("phase").$type<ThesisPhase>().notNull().default("topic"),
    researchQuestion: text("research_question"),
    outline: text("outline"),
    notes: text("notes"),
    dueDate: date("due_date"),
    /** Attempt number; a failed attempt is superseded by a new one. */
    attempt: integer("attempt").notNull().default(1),
    /** Points to the successor thesis row when this attempt was superseded. */
    supersededById: text("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("thesis_project_userId_idx").on(t.userId),
    // At most one live (non-superseded) thesis per user + program.
    uniqueIndex("thesis_active_per_program_uq")
      .on(t.userId, t.programId)
      .where(sql`${t.supersededById} is null and ${t.programId} is not null`),
  ]
)

export const thesisMilestone = pgTable(
  "thesis_milestone",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => thesisProject.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    done: boolean("done").notNull().default(false),
    sortOrder: text("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("thesis_milestone_thesisId_idx").on(t.thesisId)]
)

export const thesisProjectRelations = relations(thesisProject, ({ many, one }) => ({
  milestones: many(thesisMilestone),
  semester: one(semester, {
    fields: [thesisProject.semesterId],
    references: [semester.id],
  }),
}))

export const thesisMilestoneRelations = relations(thesisMilestone, ({ one }) => ({
  thesis: one(thesisProject, {
    fields: [thesisMilestone.thesisId],
    references: [thesisProject.id],
  }),
}))
