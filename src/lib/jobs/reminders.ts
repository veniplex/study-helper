import "server-only"
import { and, eq, gt, lte } from "drizzle-orm"
import { db } from "@/db"
import { notificationPrefs, reminderSent, studyEvent, user } from "@/db/schema"
import { sendEmail } from "@/lib/email"
import { sendPushToUser } from "@/lib/push"
import { env } from "@/lib/env"

/**
 * Sends due event reminders (push + email) based on each event's
 * reminderOffsets. Runs every few minutes via pg-boss cron.
 */
export async function sendDueReminders(): Promise<void> {
  const now = new Date()
  // Look at events starting within the next 8 days (largest offset is 7d)
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)

  const events = await db.query.studyEvent.findMany({
    where: and(gt(studyEvent.startsAt, now), lte(studyEvent.startsAt, horizon)),
  })

  for (const event of events) {
    for (const offset of event.reminderOffsets) {
      const triggerAt = new Date(event.startsAt.getTime() - offset * 60 * 1000)
      if (triggerAt > now) continue

      // Skip if already sent (unique constraint makes this race-safe)
      const inserted = await db
        .insert(reminderSent)
        .values({ eventId: event.id, offsetMinutes: offset })
        .onConflictDoNothing()
        .returning({ id: reminderSent.id })
      if (inserted.length === 0) continue

      const prefs = await db.query.notificationPrefs.findFirst({
        where: eq(notificationPrefs.userId, event.userId),
      })
      const when = event.startsAt.toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      })
      const title = `⏰ ${event.title}`
      const body = `${when}${event.location ? ` · ${event.location}` : ""}`

      if (prefs?.pushReminders !== false) {
        await sendPushToUser(event.userId, { title, body, url: "/calendar" })
      }
      if (prefs?.emailReminders !== false) {
        const owner = await db.query.user.findFirst({ where: eq(user.id, event.userId) })
        if (owner) {
          await sendEmail({
            to: owner.email,
            subject: title,
            text: `${event.title}\n${body}\n\n${env.APP_URL}/calendar`,
          })
        }
      }
    }
  }
}
