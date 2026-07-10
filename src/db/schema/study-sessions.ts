import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { studyModule } from "./studies"

/** Logged focus time (Pomodoro or manual) — feeds streaks and study-time stats. */
export const studySession = pgTable(
  "study_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    kind: text("kind").$type<"pomodoro" | "manual">().notNull().default("pomodoro"),
    durationMinutes: integer("duration_minutes").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("study_session_userId_idx").on(t.userId),
    index("study_session_startedAt_idx").on(t.startedAt),
  ]
)
