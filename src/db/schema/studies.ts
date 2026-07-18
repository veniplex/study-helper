import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"

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

/** Grading systems supported for average calculation and display. */
export type GradingSystem = "german" | "points" | "passfail"

/** One row of a percent→grade scale: everything ≥ minPercent maps to grade. */
export type GradeScaleRow = { minPercent: number; grade: number }

/** How completed assignments improve a module's final grade. */
export type BonusType = "none" | "percent_points" | "grade_steps"

/** The kind of graded deliverable a learning goal represents. */
export type GoalType =
  | "exam"
  | "assignments"
  | "term_paper"
  | "presentation"
  | "oral_exam"
  | "project"
  | "thesis"
  | "other"

/**
 * What a goal's result means for the module:
 * grade = counts toward the module grade (weighted) | bonus = improves the
 * grade (today's bonus system) | practice = feedback/self-assessment only.
 */
export type GoalGradingRole = "grade" | "bonus" | "practice"

/** Type-specific goal settings, stored as jsonb on module_goal. */
export type GoalConfig = {
  /** assignments: expected number of hand-ins. */
  expectedCount?: number | null
  /** bonus goals: the bonus a completed set of graded assignments earns. */
  bonus?: { type: BonusType; value?: number; minAvgPercent?: number; minCompletedShare?: number }
  /** term_paper: scientific paper vs. concrete task worked through. */
  variant?: "scientific" | "task"
  taskDescription?: string
  requiresSources?: boolean
  withPresentation?: boolean
  /** presentation: talk length in minutes. */
  durationMinutes?: number
}

/**
 * Keys of the module workspace tools that can be force-shown or -hidden per
 * module via `studyModule.toolOverrides` (matrix ⊕ overrides). Local alias —
 * the full tool config lives in `@/config/module-tabs` (later phase).
 */
export type ModuleToolKey =
  | "overview"
  | "materials"
  | "assignments"
  | "decks"
  | "quizzes"
  | "chat"
  | "paper"
  | "plan"

export const degreeProgram = pgTable(
  "degree_program",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    degreeType: text("degree_type"), // e.g. B.Sc., M.Sc.
    institution: text("institution"),
    targetEcts: integer("target_ects"),
    gradingSystem: text("grading_system").$type<GradingSystem>().notNull().default("german"),
    /** "What do I need?" target grade shown on the dashboard, e.g. "2.0". */
    gradeGoal: text("grade_goal"),
    /** Percent→grade scale. null = DEFAULT_GERMAN_SCALE from lib/grades. */
    gradeScale: jsonb("grade_scale").$type<GradeScaleRow[]>(),
    /** How many thesis attempts this program allows. */
    thesisMaxAttempts: integer("thesis_max_attempts").notNull().default(2),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("degree_program_userId_idx").on(t.userId)]
)

export const semester = pgTable(
  "semester",
  {
    id: id(),
    programId: text("program_id")
      .notNull()
      .references(() => degreeProgram.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "WS 2026/27" or "Semester 1"
    startDate: date("start_date"),
    endDate: date("end_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("semester_programId_idx").on(t.programId)]
)

export type ModuleStatus = "planned" | "active" | "passed" | "failed"

export const studyModule = pgTable(
  "module",
  {
    id: id(),
    semesterId: text("semester_id")
      .notNull()
      .references(() => semester.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    ects: integer("ects"),
    instructor: text("instructor"),
    status: text("status").$type<ModuleStatus>().notNull().default("planned"),
    icon: text("icon"),
    color: text("color"),
    /** Per-module force-show/hide of workspace tools (matrix ⊕ overrides). */
    toolOverrides: jsonb("tool_overrides")
      .$type<Partial<Record<ModuleToolKey, boolean>>>()
      .notNull()
      .default({}),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("module_semesterId_idx").on(t.semesterId)]
)

/**
 * A learning goal (Prüfungsleistung) of a module: 1..n per module, freely
 * combinable, each with its own deadline and grading relevance.
 */
export const moduleGoal = pgTable(
  "module_goal",
  {
    id: id(),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    type: text("type").$type<GoalType>().notNull(),
    /** Free-text label (absorbs the former module.examType). */
    title: text("title"),
    gradingRole: text("grading_role").$type<GoalGradingRole>().notNull().default("grade"),
    /** Share among all `grade` goals of the module. */
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
    /** How many attempts (incl. retakes) this goal allows. */
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** Pass/fail goal — no numeric grade. */
    passFail: boolean("pass_fail").notNull().default(false),
    /** Exam date / submission deadline. */
    dueDate: date("due_date"),
    config: jsonb("config").$type<GoalConfig>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("module_goal_moduleId_idx").on(t.moduleId)]
)

/** One attempt at a module goal (result in percent). */
export const goalAttempt = pgTable(
  "goal_attempt",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => moduleGoal.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull().default(1),
    resultPercent: numeric("result_percent", { precision: 5, scale: 2 }),
    date: date("date"),
    passed: boolean("passed"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("goal_attempt_goalId_idx").on(t.goalId)]
)

/** Named contact person for a module (lecturer, tutor, examiner, …). */
export const moduleContact = pgTable(
  "module_contact",
  {
    id: id(),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("module_contact_moduleId_idx").on(t.moduleId)]
)

export const grade = pgTable(
  "grade",
  {
    id: id(),
    moduleId: text("module_id")
      .notNull()
      .references(() => studyModule.id, { onDelete: "cascade" }),
    value: numeric("value", { precision: 5, scale: 2 }).notNull(),
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
    attempt: integer("attempt").notNull().default(1),
    gradedAt: date("graded_at"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("grade_moduleId_idx").on(t.moduleId)]
)

export type ResourceType = "moodle" | "ilias" | "fileshare" | "discord" | "teams" | "website" | "other"

export const externalResource = pgTable(
  "external_resource",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    programId: text("program_id").references(() => degreeProgram.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "cascade" }),
    type: text("type").$type<ResourceType>().notNull().default("website"),
    name: text("name").notNull(),
    url: text("url").notNull(),
    username: text("username"),
    /** AES-encrypted free-text note (e.g. password hints — never plaintext). */
    encryptedNote: text("encrypted_note"),
    ...timestamps,
  },
  (t) => [
    index("external_resource_userId_idx").on(t.userId),
    index("external_resource_moduleId_idx").on(t.moduleId),
  ]
)

export type EventType = "exam" | "deadline" | "lecture" | "other"

/** How an event repeats. Occurrences are expanded at read time, not stored.
 * "custom" = any set of weekdays every N weeks (recurrenceWeekdays/-Interval). */
export type EventRecurrence = "none" | "weekly" | "biweekly" | "custom"

export const studyEvent = pgTable(
  "event",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    type: text("type").$type<EventType>().notNull().default("other"),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: text("location"),
    notes: text("notes"),
    allDay: boolean("all_day").notNull().default(false),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    /** Reminder offsets in minutes before startsAt, e.g. [10080, 1440]. */
    reminderOffsets: jsonb("reminder_offsets").$type<number[]>().notNull().default([]),
    /** Repetition: occurrences run from startsAt until recurrenceUntil (inclusive). */
    recurrence: text("recurrence").$type<EventRecurrence>().notNull().default("none"),
    recurrenceUntil: date("recurrence_until"),
    /** For "custom": weekdays 0 (Sunday) – 6 the event repeats on. */
    recurrenceWeekdays: jsonb("recurrence_weekdays").$type<number[]>(),
    /** For "custom": repeat every N weeks (1–4), anchored at startsAt's week. */
    recurrenceInterval: integer("recurrence_interval"),
    ...timestamps,
  },
  (t) => [
    index("event_userId_idx").on(t.userId),
    index("event_startsAt_idx").on(t.startsAt),
  ]
)

export const degreeProgramRelations = relations(degreeProgram, ({ many }) => ({
  semesters: many(semester),
}))

export const semesterRelations = relations(semester, ({ one, many }) => ({
  program: one(degreeProgram, {
    fields: [semester.programId],
    references: [degreeProgram.id],
  }),
  modules: many(studyModule),
}))

export const studyModuleRelations = relations(studyModule, ({ one, many }) => ({
  semester: one(semester, {
    fields: [studyModule.semesterId],
    references: [semester.id],
  }),
  grades: many(grade),
  resources: many(externalResource),
  goals: many(moduleGoal),
  contacts: many(moduleContact),
}))

export const moduleGoalRelations = relations(moduleGoal, ({ one, many }) => ({
  module: one(studyModule, {
    fields: [moduleGoal.moduleId],
    references: [studyModule.id],
  }),
  attempts: many(goalAttempt),
}))

export const goalAttemptRelations = relations(goalAttempt, ({ one }) => ({
  goal: one(moduleGoal, {
    fields: [goalAttempt.goalId],
    references: [moduleGoal.id],
  }),
}))

export const moduleContactRelations = relations(moduleContact, ({ one }) => ({
  module: one(studyModule, {
    fields: [moduleContact.moduleId],
    references: [studyModule.id],
  }),
}))

export const gradeRelations = relations(grade, ({ one }) => ({
  module: one(studyModule, {
    fields: [grade.moduleId],
    references: [studyModule.id],
  }),
}))

export const externalResourceRelations = relations(externalResource, ({ one }) => ({
  module: one(studyModule, {
    fields: [externalResource.moduleId],
    references: [studyModule.id],
  }),
  program: one(degreeProgram, {
    fields: [externalResource.programId],
    references: [degreeProgram.id],
  }),
}))

export const studyEventRelations = relations(studyEvent, ({ one }) => ({
  module: one(studyModule, {
    fields: [studyEvent.moduleId],
    references: [studyModule.id],
  }),
}))
