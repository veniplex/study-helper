import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { moduleGoal, studyModule } from "./studies"
import { semesterPlan } from "./semester-plan"

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/**
 * Where a plan task came from — used for idempotent (re)generation: a task with
 * `{kind, refId}` is upserted by its refId so re-running generation never
 * duplicates and never touches manually created/edited tasks (`kind: "manual"`).
 */
export type PlanTaskSource = {
  kind: "outline_topic" | "assignment" | "milestone" | "manual" | "ai"
  /** Id of the backing row (outline topic, assignment, milestone). */
  refId?: string
}

/**
 * Per-module planning preferences (the "content layer" knobs a student tweaks).
 * One row per module; the scheduler reads these to distribute time across
 * modules. Separate from the tasks so prefs survive task regeneration.
 */
export const modulePlan = pgTable(
  "module_plan",
  {
    id: id(),
    moduleId: text("module_id")
      .notNull()
      .unique()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    /** Module (de)activatable in the plan without deleting its tasks. */
    active: boolean("active").notNull().default(true),
    /** Time share under parallel scheduling. */
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
    /** Optional fixed weekly budget in hours ("2.5h for module B"). */
    weeklyHoursTarget: numeric("weekly_hours_target", { precision: 5, scale: 2 }),
    /** Ordering group: 1 = now, 2 = after, … (sequential strategy). */
    phase: integer("phase").notNull().default(1),
    /** Soft weekday preference ("module A on Mondays"), weekdays 0 (Sun) – 6. */
    preferredWeekdays: jsonb("preferred_weekdays").$type<number[]>(),
    ...timestamps,
  },
  (t) => [index("module_plan_module_idx").on(t.moduleId)]
)

/**
 * A scheduled study block (a calendar appointment with date/time/duration),
 * produced by the deterministic scheduler. Holds 1..n tasks via
 * `plan_task.sessionId`. `pinned` sessions are treated as fixed by the
 * scheduler (a student moved them); `done` sessions are never touched on replan.
 */
export const planSession = pgTable(
  "plan_session",
  {
    id: id(),
    semesterPlanId: text("semester_plan_id")
      .notNull()
      .references(() => semesterPlan.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(), // "HH:mm"
    durationMinutes: integer("duration_minutes").notNull(),
    /** Student-fixed → the scheduler keeps it as-is and plans around it. */
    pinned: boolean("pinned").notNull().default(false),
    done: boolean("done").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("plan_session_plan_date_idx").on(t.semesterPlanId, t.date)]
)

/**
 * A concrete unit of work for a module ("the content layer"), derived from a
 * module's goals or created by hand. Each task belongs to at most one session
 * (`sessionId`); the scheduler fills sessions with tasks until the duration is
 * used up. Large tasks are split at generation time (no task spans sessions).
 */
export const planTask = pgTable(
  "plan_task",
  {
    id: id(),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    goalId: text("goal_id").references(() => moduleGoal.id, { onDelete: "set null" }),
    sessionId: text("session_id").references(() => planSession.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(60),
    done: boolean("done").notNull().default(false),
    /** Hard deadline (submission, milestone). */
    dueDate: date("due_date"),
    source: jsonb("source")
      .$type<PlanTaskSource>()
      .notNull()
      .default({ kind: "manual" }),
    sortOrder: integer("sort_order").notNull().default(0),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("plan_task_module_idx").on(t.moduleId),
    index("plan_task_session_idx").on(t.sessionId),
  ]
)

export const modulePlanRelations = relations(modulePlan, ({ one }) => ({
  module: one(studyModule, {
    fields: [modulePlan.moduleId],
    references: [studyModule.id],
  }),
}))

export const planSessionRelations = relations(planSession, ({ one, many }) => ({
  semesterPlan: one(semesterPlan, {
    fields: [planSession.semesterPlanId],
    references: [semesterPlan.id],
  }),
  module: one(studyModule, {
    fields: [planSession.moduleId],
    references: [studyModule.id],
  }),
  tasks: many(planTask),
}))

export const planTaskRelations = relations(planTask, ({ one }) => ({
  module: one(studyModule, {
    fields: [planTask.moduleId],
    references: [studyModule.id],
  }),
  goal: one(moduleGoal, {
    fields: [planTask.goalId],
    references: [moduleGoal.id],
  }),
  session: one(planSession, {
    fields: [planTask.sessionId],
    references: [planSession.id],
  }),
}))
