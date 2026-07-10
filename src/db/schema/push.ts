import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { studyEvent } from "./studies"

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscription_userId_idx").on(t.userId)]
)

/** Tracks which (event, offset) reminders were already sent. */
export const reminderSent = pgTable(
  "reminder_sent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => studyEvent.id, { onDelete: "cascade" }),
    offsetMinutes: integer("offset_minutes").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reminder_sent_event_offset").on(t.eventId, t.offsetMinutes)]
)

export type ChannelPrefs = { email: boolean; push: boolean }
export type NotificationChannels = {
  /** Calendar event reminders (exams, lectures, …) */
  events: ChannelPrefs
  /** Assignment deadline reminders */
  assignments: ChannelPrefs
  /** Daily "study today" plan reminder */
  dailyPlan: ChannelPrefs
}

/** Per-user notification preferences (extends user_prefs semantics). */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  emailReminders: boolean("email_reminders").notNull().default(true),
  pushReminders: boolean("push_reminders").notNull().default(true),
  /** Granular category × channel matrix; null → derived from the legacy booleans. */
  channels: jsonb("channels").$type<NotificationChannels>(),
})

/** Generic dedup for non-event notifications (assignments, daily plan). */
export const notificationSent = pgTable(
  "notification_sent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** e.g. "assignment:<id>:1440" or "dailyplan:2026-07-10" */
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("notification_sent_user_key").on(t.userId, t.key)]
)
