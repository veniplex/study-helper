import "server-only"
import { and, eq, gt, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm"
import { db } from "@/db"
import {
  assignment,
  notificationPrefs,
  notificationSent,
  planSession,
  reminderSent,
  semesterPlan,
  studyEvent,
  user,
  type NotificationChannels,
} from "@/db/schema"
import { sendEmail } from "@/lib/email"
import { expandOccurrences, toIsoDate } from "@/lib/events/recurrence"
import { sendPushToUser } from "@/lib/push"
import { getAppName } from "@/lib/settings"
import { env } from "@/lib/env"

/** Resolves the category × channel matrix, falling back to the legacy booleans. */
async function getChannels(userId: string): Promise<NotificationChannels> {
  const prefs = await db.query.notificationPrefs.findFirst({
    where: eq(notificationPrefs.userId, userId),
  })
  if (prefs?.channels) return prefs.channels
  const email = prefs?.emailReminders !== false
  const push = prefs?.pushReminders !== false
  return {
    events: { email, push },
    assignments: { email, push },
    dailyPlan: { email, push },
  }
}

async function notify(
  userId: string,
  channels: { email: boolean; push: boolean },
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (channels.push) {
    await sendPushToUser(userId, payload)
  }
  if (channels.email) {
    const owner = await db.query.user.findFirst({ where: eq(user.id, userId) })
    if (owner) {
      await sendEmail({
        to: owner.email,
        subject: payload.title,
        text: `${payload.body}\n\n${env.APP_URL}${payload.url}`,
      })
    }
  }
}

/** Race-safe dedup for non-event notifications. Returns true if we own the send. */
async function claimNotification(userId: string, key: string): Promise<boolean> {
  const inserted = await db
    .insert(notificationSent)
    .values({ userId, key })
    .onConflictDoNothing()
    .returning({ id: notificationSent.id })
  return inserted.length > 0
}

/**
 * Sends due event reminders (push + email) based on each event's
 * reminderOffsets. Runs every few minutes via pg-boss cron.
 */
export async function sendDueReminders(): Promise<void> {
  const now = new Date()
  // Look at occurrences starting within the next 8 days (largest offset is 7d)
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)

  const events = await db.query.studyEvent.findMany({
    where: or(
      and(gt(studyEvent.startsAt, now), lte(studyEvent.startsAt, horizon)),
      // Recurring series only while they are actually alive: the series has
      // started (before the horizon) and has not ended yet — without this the
      // 5-minute cron reloads every recurring event ever created.
      and(
        ne(studyEvent.recurrence, "none"),
        lte(studyEvent.startsAt, horizon),
        or(isNull(studyEvent.recurrenceUntil), gte(studyEvent.recurrenceUntil, toIsoDate(now)))
      )
    ),
  })

  for (const event of events) {
    const occurrences = expandOccurrences(event, now, horizon)
    for (const occ of occurrences) {
      for (const offset of event.reminderOffsets) {
        const triggerAt = new Date(occ.startsAt.getTime() - offset * 60 * 1000)
        if (triggerAt > now) continue

        // Skip if already sent (unique constraint makes this race-safe)
        const inserted = await db
          .insert(reminderSent)
          .values({
            eventId: event.id,
            offsetMinutes: offset,
            occurrenceDate: occ.isRecurrenceInstance ? occ.occurrenceDate : "",
          })
          .onConflictDoNothing()
          .returning({ id: reminderSent.id })
        if (inserted.length === 0) continue

        const channels = await getChannels(event.userId)
        const when = occ.startsAt.toLocaleString("de-DE", {
          dateStyle: "medium",
          timeStyle: event.allDay ? undefined : "short",
        })
        await notify(event.userId, channels.events, {
          title: `⏰ ${event.title}`,
          body: `${when}${event.location ? ` · ${event.location}` : ""}`,
          url: "/calendar",
        })
      }
    }
  }

  await sendAssignmentReminders(now)
}

/** Reminds about open assignments 24h before their due date. */
async function sendAssignmentReminders(now: Date): Promise<void> {
  // The 24h-before trigger can only fire for due dates around today — bound
  // the query instead of scanning every open assignment ever created.
  const windowStart = toIsoDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000))
  const windowEnd = toIsoDate(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000))
  const rows = await db.query.assignment.findMany({
    where: and(
      isNotNull(assignment.dueDate),
      ne(assignment.status, "graded"),
      gte(assignment.dueDate, windowStart),
      lte(assignment.dueDate, windowEnd)
    ),
    with: { module: { columns: { name: true } } },
  })

  for (const row of rows) {
    const due = new Date(`${row.dueDate}T23:59`)
    const triggerAt = new Date(due.getTime() - 24 * 60 * 60 * 1000)
    if (triggerAt > now || due < now) continue
    if (!(await claimNotification(row.userId, `assignment:${row.id}:1440`))) continue

    const channels = await getChannels(row.userId)
    await notify(row.userId, channels.assignments, {
      title: `📋 ${row.title}`,
      body: `${row.module.name} · ${new Date(row.dueDate!).toLocaleDateString("de-DE", { dateStyle: "medium" })}`,
      url: "/calendar",
    })
  }
}

/** Daily morning reminder listing today's open plan sessions. */
export async function sendDailyPlanReminders(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  const sessions = await db
    .select({ userId: semesterPlan.userId })
    .from(planSession)
    .innerJoin(semesterPlan, eq(planSession.semesterPlanId, semesterPlan.id))
    .where(and(eq(planSession.date, today), eq(planSession.done, false)))

  const byUser = new Map<string, number>()
  for (const row of sessions) {
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + 1)
  }

  const appName = await getAppName()
  for (const [userId, count] of byUser) {
    if (!(await claimNotification(userId, `dailyplan:${today}`))) continue
    const channels = await getChannels(userId)
    await notify(userId, channels.dailyPlan, {
      title: `📚 ${appName}`,
      body: `Heute stehen ${count} Lerneinheiten in deinem Lernplan.`,
      url: "/",
    })
  }
}
