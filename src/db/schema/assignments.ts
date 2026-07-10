import { date, index, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { studyModule } from "./studies"
import { material } from "./materials"

export type AssignmentStatus = "open" | "submitted" | "graded"

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
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    status: text("status").$type<AssignmentStatus>().notNull().default("open"),
    pointsAchieved: numeric("points_achieved", { precision: 7, scale: 2 }),
    pointsMax: numeric("points_max", { precision: 7, scale: 2 }),
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
