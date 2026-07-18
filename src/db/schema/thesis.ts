import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import { user } from "./auth"
import { degreeProgram, moduleGoal, semester } from "./studies"

/** Phases of a scientific writing project (thesis / wissenschaftliche Arbeit). */
export type ThesisPhase = "topic" | "exposé" | "research" | "writing" | "revision" | "submitted"
/** Phases of a concrete task worked through (Aufgabenbearbeitung). */
export type TaskPhase = "briefing" | "working" | "writing" | "revision" | "submitted"
/** Superset covering both writing-project variants. */
export type WritingPhase = ThesisPhase | TaskPhase

/** What kind of writing project this is. */
export type WritingKind = "thesis" | "term_paper"
/** scientific = research paper (RQ, sources) | task = concrete assignment. */
export type WritingVariant = "scientific" | "task"

/**
 * A writing workspace shared by the degree thesis and module term papers
 * (Hausarbeiten): phases, milestones, outline/notes/RQ and the AI helpers are
 * identical, so both kinds live in one table, flexing via `kind`/`variant`.
 */
export const writingProject = pgTable(
  "writing_project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    programId: text("program_id").references(() => degreeProgram.id, { onDelete: "cascade" }),
    semesterId: text("semester_id").references(() => semester.id, { onDelete: "set null" }),
    /** thesis (program-bound, attempt/retry logic) vs. term_paper (goal-bound). */
    kind: text("kind").$type<WritingKind>().notNull().default("thesis"),
    /** The module goal this project fulfils (term paper / thesis goal). */
    goalId: text("goal_id").references(() => moduleGoal.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    thesisType: text("thesis_type"), // Bachelor, Master, ...
    variant: text("variant").$type<WritingVariant>().notNull().default("scientific"),
    /** task variant: the assignment statement worked through. */
    taskDescription: text("task_description"),
    phase: text("phase").$type<WritingPhase>().notNull().default("topic"),
    researchQuestion: text("research_question"),
    outline: text("outline"),
    notes: text("notes"),
    dueDate: date("due_date"),
    /** Attempt number; a failed attempt is superseded by a new one. */
    attempt: integer("attempt").notNull().default(1),
    /** Points to the successor row when this attempt was superseded. */
    supersededById: text("superseded_by_id").references((): AnyPgColumn => writingProject.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("writing_project_userId_idx").on(t.userId),
    // At most one live (non-superseded) thesis per user + program.
    uniqueIndex("thesis_active_per_program_uq")
      .on(t.userId, t.programId)
      .where(sql`${t.supersededById} is null and ${t.programId} is not null`),
    // At most one live term paper per module goal.
    uniqueIndex("writing_active_per_goal_uq")
      .on(t.goalId)
      .where(sql`${t.kind} = 'term_paper' and ${t.supersededById} is null and ${t.goalId} is not null`),
  ]
)

export const writingMilestone = pgTable(
  "writing_milestone",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => writingProject.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    done: boolean("done").notNull().default(false),
    sortOrder: text("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("writing_milestone_projectId_idx").on(t.projectId)]
)

export const writingProjectRelations = relations(writingProject, ({ many, one }) => ({
  milestones: many(writingMilestone),
  semester: one(semester, {
    fields: [writingProject.semesterId],
    references: [semester.id],
  }),
  goal: one(moduleGoal, {
    fields: [writingProject.goalId],
    references: [moduleGoal.id],
  }),
}))

export const writingMilestoneRelations = relations(writingMilestone, ({ one }) => ({
  project: one(writingProject, {
    fields: [writingMilestone.projectId],
    references: [writingProject.id],
  }),
}))
