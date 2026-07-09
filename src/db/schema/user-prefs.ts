import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

/** Per-user preferences and tokens that are not part of Better Auth. */
export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Secret token for the personal ICS calendar feed. */
  icsToken: text("ics_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
