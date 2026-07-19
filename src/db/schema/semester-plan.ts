import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { semester } from "./studies"
import type { ScheduleWarning } from "@/lib/plan/scheduler"

export type PlanAvailability = {
  /** Weekly study windows, weekday 0 (Sunday) – 6. */
  weekly: { weekday: number; from: string; to: string }[]
  /** Date ranges where the user is unavailable (vacation etc.). */
  blackouts: { from: string; to: string; label?: string }[]
  /** Recurring unavailability, e.g. every Tuesday 18:00–19:00 or every second
   * Sunday. interval 1 = weekly, 2 = every second week (anchored at `anchor`). */
  recurring?: {
    weekday: number
    /** Optional additional weekdays; when set, overrides `weekday`. */
    weekdays?: number[]
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

/**
 * Scheduler tuning for a semester plan. Missing/null is treated as
 * `{ maxSessionsPerDay: 2, sessionMinutes: { min: 45, max: 180 } }`.
 */
export type SemesterPlanConfig = {
  maxSessionsPerDay?: number
  sessionMinutes?: { min: number; max: number }
}

/**
 * Per-ISO-week study-hour overrides ("this week I only have 4h"). Keyed by the
 * ISO-8601 week key ("YYYY-Www", e.g. "2026-W31"), value = hours for that week.
 * The scheduler caps the whole plan's assigned minutes that week at hours×60.
 */
export type WeekOverrides = Record<string, number>

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
    /** Scheduler tuning; null → default (2 sessions/day, 45–180 min). */
    config: jsonb("config").$type<SemesterPlanConfig>(),
    /** Per-ISO-week hour overrides ({"2026-W31": 4}). null/absent → no override. */
    weekOverrides: jsonb("week_overrides").$type<WeekOverrides>(),
    /** Set when a mutation invalidated the plan; null = fresh (up to date). */
    staleAt: timestamp("stale_at", { withTimezone: true }),
    /** Warnings from the last successful recompute (readiness/UI surface). */
    lastWarnings: jsonb("last_warnings").$type<ScheduleWarning[]>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("semester_plan_user_idx").on(t.userId)]
)

export const semesterPlanRelations = relations(semesterPlan, ({ one }) => ({
  semester: one(semester, {
    fields: [semesterPlan.semesterId],
    references: [semester.id],
  }),
}))
