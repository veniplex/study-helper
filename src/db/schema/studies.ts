import {
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
    examType: text("exam_type"), // e.g. written exam, oral, project
    status: text("status").$type<ModuleStatus>().notNull().default("planned"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("module_semesterId_idx").on(t.semesterId)]
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
    /** Reminder offsets in minutes before startsAt, e.g. [10080, 1440]. */
    reminderOffsets: jsonb("reminder_offsets").$type<number[]>().notNull().default([]),
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
