import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { moduleGoal, studyModule } from "./studies"
import { material } from "./materials"

export type AssignmentStatus = "open" | "submitted" | "graded"

/** graded = counts toward module bonus; practice = self-assessment only. */
export type AssignmentKind = "graded" | "practice"

/** Checklist entry inside an assignment (e.g. "Aufgabe 1", "Aufgabe 2"). */
export type AssignmentSubtask = { id: string; title: string; done: boolean }

/** Graded coursework (Abgaben) per module — bonus-point sheets, homework
 * hand-ins etc. Not user-created study content. */
export const assignment = pgTable(
  "assignment",
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
    /** The learning goal this sheet belongs to (grade/bonus/practice role). */
    goalId: text("goal_id").references(() => moduleGoal.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    status: text("status").$type<AssignmentStatus>().notNull().default("open"),
    kind: text("kind").$type<AssignmentKind>().notNull().default("graded"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    pointsAchieved: numeric("points_achieved", { precision: 7, scale: 2 }),
    pointsMax: numeric("points_max", { precision: 7, scale: 2 }),
    /** Optional checklist of subtasks. */
    subtasks: jsonb("subtasks").$type<AssignmentSubtask[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("assignment_module_idx").on(t.moduleId), index("assignment_user_idx").on(t.userId)]
)

/** Links assignments to module materials (task sheets, solutions, …). */
export const assignmentMaterial = pgTable(
  "assignment_material",
  {
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignment.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => material.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.materialId] })]
)

export const assignmentRelations = relations(assignment, ({ one, many }) => ({
  module: one(studyModule, {
    fields: [assignment.moduleId],
    references: [studyModule.id],
  }),
  goal: one(moduleGoal, {
    fields: [assignment.goalId],
    references: [moduleGoal.id],
  }),
  materials: many(assignmentMaterial),
}))

export const assignmentMaterialRelations = relations(assignmentMaterial, ({ one }) => ({
  assignment: one(assignment, {
    fields: [assignmentMaterial.assignmentId],
    references: [assignment.id],
  }),
  material: one(material, {
    fields: [assignmentMaterial.materialId],
    references: [material.id],
  }),
}))
