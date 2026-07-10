import { boolean, date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"

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
    title: text("title").notNull(),
    thesisType: text("thesis_type"), // Bachelor, Master, ...
    phase: text("phase").$type<ThesisPhase>().notNull().default("topic"),
    researchQuestion: text("research_question"),
    outline: text("outline"),
    notes: text("notes"),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("thesis_project_userId_idx").on(t.userId)]
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

export const thesisProjectRelations = relations(thesisProject, ({ many }) => ({
  milestones: many(thesisMilestone),
}))

export const thesisMilestoneRelations = relations(thesisMilestone, ({ one }) => ({
  thesis: one(thesisProject, {
    fields: [thesisMilestone.thesisId],
    references: [thesisProject.id],
  }),
}))
