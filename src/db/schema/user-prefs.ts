import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { degreeProgram, semester } from "./studies"

/** Per-user preferences and tokens that are not part of Better Auth. */
export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Secret token for the personal ICS calendar feed. */
  icsToken: text("ics_token").unique(),
  /** Active study context shown in the sidebar. */
  activeProgramId: text("active_program_id").references(() => degreeProgram.id, {
    onDelete: "set null",
  }),
  activeSemesterId: text("active_semester_id").references(() => semester.id, {
    onDelete: "set null",
  }),
  /** User's preferred AI model ref ("providerId:modelId"); null = global default. */
  preferredModel: text("preferred_model"),
  /** Weekly study-time goal in minutes; null = no goal set. */
  weeklyGoalMinutes: integer("weekly_goal_minutes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
