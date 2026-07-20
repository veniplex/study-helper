import "server-only"
import { and, eq, gt, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm"
import { createTranslator } from "next-intl"
import { db } from "@/db"
import { routing } from "@/i18n/routing"
import {
  assignment,
  notificationPrefs,
  notificationSent,
  planSession,
  reminderSent,
  semesterPlan,
  studyEvent,
  user,
  userPrefs,
  type NotificationChannels,
} from "@/db/schema"
import { sendEmail } from "@/lib/email"
import { expandOccurrences, toIsoDate } from "@/lib/events/recurrence"
import { sendPushToUser } from "@/lib/push"
import { getAppName } from "@/lib/settings"
import { env } from "@/lib/env"

/**
 * Resolves the notification locale for a user from `user_prefs.locale`
 * (migration 0042), falling back to the app default when unset or unsupported.
 * All reminder formatting flows through the returned locale.
 */
async function reminderLocale(userId: string): Promise<string> {
  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
    columns: { locale: true },
  })
  const locale = prefs?.locale
  return locale && routing.locales.includes(locale as (typeof routing.locales)[number])
    ? locale
    : routing.defaultLocale
}

type NotificationsT = (key: string, values?: Record<string, string | number>) => string

const messagesCache = new Map<string, Record<string, unknown>>()

/** Server-side (request-free, job-safe) translator for the `notifications` namespace. */
async function notificationsTranslator(locale: string): Promise<NotificationsT> {
  let messages = messagesCache.get(locale)
  if (!messages) {
    messages = (await import(`../../../messages/${locale}.json`)).default
    messagesCache.set(locale, messages!)
  }
  const t = createTranslator({ locale, messages, namespace: "notifications" })
  return t as unknown as NotificationsT
}

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

/** Race-safe dedup for non-event notifications. Returns the claim id, or null. */
async function claimNotification(userId: string, key: string): Promise<string | null> {
  const inserted = await db
    .insert(notificationSent)
    .values({ userId, key })
    .onConflictDoNothing()
    .returning({ id: notificationSent.id })
  return inserted[0]?.id ?? null
}

/**
 * Delivers a claimed notification, releasing the claim again if delivery fails.
 *
 * The claim row is written before the send — that is what makes the 5-minute
 * cron race-safe — so a throwing send would otherwise burn it: the reminder is
 * lost for good, because the next run sees it as already sent. Worse, the error
 * escaped the surrounding loop, so a single dead SMTP server or one bad address
 * silenced every remaining reminder in that run.
 *
 * Isolating the failure and releasing the claim turns both problems into a
 * retry on the next cron tick.
 */
async function deliverClaimed(
  userId: string,
  channels: { email: boolean; push: boolean },
  payload: { title: string; body: string; url: string },
  release: () => Promise<unknown>
): Promise<void> {
  try {
    await notify(userId, channels, payload)
  } catch (error) {
    console.error("[reminders] delivery failed, releasing claim", userId, payload.title, error)
    await release().catch((releaseError) =>
      console.error("[reminders] could not release claim", releaseError)
    )
  }
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
        const claimId = inserted[0]?.id
        if (!claimId) continue

        const channels = await getChannels(event.userId)
        const locale = await reminderLocale(event.userId)
        const t = await notificationsTranslator(locale)
        const when = new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: event.allDay ? undefined : "short",
        }).format(occ.startsAt)
        await deliverClaimed(
          event.userId,
          channels.events,
          {
            title: t("eventTitle", { title: event.title }),
            body: event.location
              ? t("eventBodyLocation", { when, location: event.location })
              : t("eventBody", { when }),
            url: "/calendar",
          },
          () => db.delete(reminderSent).where(eq(reminderSent.id, claimId))
        )
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
    const claimId = await claimNotification(row.userId, `assignment:${row.id}:1440`)
    if (!claimId) continue

    const channels = await getChannels(row.userId)
    const locale = await reminderLocale(row.userId)
    const t = await notificationsTranslator(locale)
    const dueLabel = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(row.dueDate!)
    )
    await deliverClaimed(
      row.userId,
      channels.assignments,
      {
        title: t("assignmentTitle", { title: row.title }),
        body: t("assignmentBody", { module: row.module.name, due: dueLabel }),
        url: "/calendar",
      },
      () => db.delete(notificationSent).where(eq(notificationSent.id, claimId))
    )
  }
}

/** Daily morning reminder listing today's open plan sessions. */
export async function sendDailyPlanReminders(): Promise<void> {
  // Local ISO date, matching how plan_session.date is written (B6/day-key policy).
  const today = toIsoDate(new Date())

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
    const claimId = await claimNotification(userId, `dailyplan:${today}`)
    if (!claimId) continue
    const channels = await getChannels(userId)
    const locale = await reminderLocale(userId)
    const t = await notificationsTranslator(locale)
    await deliverClaimed(
      userId,
      channels.dailyPlan,
      {
        title: t("dailyPlanTitle", { appName }),
        body: t("dailyPlanBody", { count }),
        url: "/",
      },
      () => db.delete(notificationSent).where(eq(notificationSent.id, claimId))
    )
  }
}
