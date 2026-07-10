import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { semester, studyModule } from "./studies"
import { assignment } from "./assignments"

export type PlanAvailability = {
  /** Weekly study windows, weekday 0 (Sunday) – 6. */
  weekly: { weekday: number; from: string; to: string }[]
  /** Date ranges where the user is unavailable (vacation etc.). */
  blackouts: { from: string; to: string; label?: string }[]
  /** Recurring unavailability, e.g. every Tuesday 18:00–19:00 or every second
   * Sunday. interval 1 = weekly, 2 = every second week (anchored at `anchor`). */
  recurring?: {
    weekday: number
    from: string
    to: string
    interval: 1 | 2
    /** First affected date for biweekly rhythms (ISO date). */
    anchor?: string
    label?: string
    /** Expert mode: 5-field cron expression for the start times; overrides
     * weekday/from/to/interval when set. */
    cron?: string
    /** Blocked duration per cron occurrence (minutes). */
    durationMinutes?: number
  }[]
}

export type SemesterPlanItemKind = "study" | "review" | "assignment"

/** One AI-generated study plan per semester, based on the user's availability,
 * exam dates and assignment deadlines. */
export const semesterPlan = pgTable(
  "semester_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    semesterId: text("semester_id")
      .notNull()
      .unique()
      .references(() => semester.id, { onDelete: "cascade" }),
    availability: jsonb("availability").$type<PlanAvailability>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("semester_plan_user_idx").on(t.userId)]
)

export const semesterPlanItem = pgTable(
  "semester_plan_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text("plan_id")
      .notNull()
      .references(() => semesterPlan.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id").references(() => assignment.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<SemesterPlanItemKind>().notNull().default("study"),
    title: text("title").notNull(),
    date: date("date").notNull(),
    startTime: text("start_time"), // "HH:mm"
    durationMinutes: integer("duration_minutes").notNull().default(60),
    done: boolean("done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("semester_plan_item_plan_idx").on(t.planId, t.date)]
)

export const semesterPlanRelations = relations(semesterPlan, ({ one, many }) => ({
  semester: one(semester, {
    fields: [semesterPlan.semesterId],
    references: [semester.id],
  }),
  items: many(semesterPlanItem),
}))

export const semesterPlanItemRelations = relations(semesterPlanItem, ({ one }) => ({
  plan: one(semesterPlan, {
    fields: [semesterPlanItem.planId],
    references: [semesterPlan.id],
  }),
  module: one(studyModule, {
    fields: [semesterPlanItem.moduleId],
    references: [studyModule.id],
  }),
}))
