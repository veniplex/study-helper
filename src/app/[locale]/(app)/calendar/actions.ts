"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { studyEvent, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"

async function ownEvent(eventId: string, userId: string) {
  const row = await db.query.studyEvent.findFirst({
    where: and(eq(studyEvent.id, eventId), eq(studyEvent.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

const eventSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum(["exam", "deadline", "lecture", "other"]),
  startsAt: z
    .string()
    .datetime({ local: true })
    .or(z.string().datetime())
    .or(z.string().date()),
  endsAt: z
    .string()
    .datetime({ local: true })
    .or(z.string().datetime())
    .or(z.string().date())
    .optional()
    .nullable(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  moduleId: z.string().optional().nullable(),
  allDay: z.boolean().default(false),
  reminderOffsets: z.array(z.number().int().positive()).default([]),
  recurrence: z.enum(["none", "weekly", "biweekly", "custom"]).default("none"),
  recurrenceUntil: z.string().date().optional().nullable(),
  recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  recurrenceInterval: z.number().int().min(1).max(4).optional().nullable(),
})

/** The recurrence columns shared by create and update. */
function recurrenceValues(data: z.infer<typeof eventSchema>) {
  const recurring = data.recurrence !== "none"
  return {
    recurrence: data.recurrence,
    recurrenceUntil: recurring ? (data.recurrenceUntil ?? null) : null,
    recurrenceWeekdays:
      data.recurrence === "custom" ? (data.recurrenceWeekdays ?? null) : null,
    recurrenceInterval:
      data.recurrence === "custom" ? (data.recurrenceInterval ?? 1) : null,
  }
}

/** All-day events store their date at local midnight. */
function parseStart(value: string, allDay: boolean): Date {
  return new Date(allDay && !value.includes("T") ? `${value}T00:00` : value)
}

export async function createEvent(input: unknown) {
  const session = await requireSession()
  const data = eventSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  const [created] = await db
    .insert(studyEvent)
    .values({
      userId: session.user.id,
      title: data.title,
      type: data.type,
      startsAt: parseStart(data.startsAt, data.allDay),
      endsAt: data.endsAt ? parseStart(data.endsAt, data.allDay) : null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      moduleId: data.moduleId || null,
      allDay: data.allDay,
      reminderOffsets: data.reminderOffsets,
      ...recurrenceValues(data),
    })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "event",
    entityId: created.id,
    entityLabel: data.title,
    after: created,
  })
  revalidatePath("/calendar")
  return { ok: true as const }
}

export async function updateEvent(eventId: string, input: unknown) {
  const session = await requireSession()
  const data = eventSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  const before = await ownEvent(eventId, session.user.id)
  await db
    .update(studyEvent)
    .set({
      title: data.title,
      type: data.type,
      startsAt: parseStart(data.startsAt, data.allDay),
      endsAt: data.endsAt ? parseStart(data.endsAt, data.allDay) : null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      moduleId: data.moduleId || null,
      allDay: data.allDay,
      reminderOffsets: data.reminderOffsets,
      ...recurrenceValues(data),
    })
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "event",
    entityId: eventId,
    entityLabel: data.title,
    before,
    after: { ...before, ...data },
  })
  revalidatePath("/calendar")
  return { ok: true as const }
}

const moveSchema = z.object({
  startsAt: z.string().datetime({ local: true }).or(z.string().datetime()),
  endsAt: z.string().datetime({ local: true }).or(z.string().datetime()).optional().nullable(),
})

/** Drag & drop / resize in the calendar view: only shifts the times. */
export async function moveEvent(eventId: string, input: unknown) {
  const session = await requireSession()
  const data = moveSchema.parse(input)
  const before = await ownEvent(eventId, session.user.id)
  // Interpret drag/resize times through the same server-local convention as
  // create/update (parseStart) so the whole calendar stays consistent (E20).
  await db
    .update(studyEvent)
    .set({
      startsAt: parseStart(data.startsAt, false),
      endsAt: data.endsAt ? parseStart(data.endsAt, false) : null,
    })
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "event",
    entityId: eventId,
    entityLabel: before.title,
    before,
    after: { ...before, startsAt: data.startsAt, endsAt: data.endsAt ?? null },
  })
  revalidatePath("/calendar")
  return { ok: true as const }
}

/**
 * Deletes a single occurrence of a recurring event by recording its (local ISO)
 * date in `skip_dates` — `expandOccurrences` then skips it while the rest of the
 * series survives (E18). Single-occurrence editing is intentionally deferred.
 */
export async function deleteEventOccurrence(eventId: string, occurrenceDate: string) {
  const session = await requireSession()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) throw new Error("Invalid date")
  const before = await ownEvent(eventId, session.user.id)
  if (before.recurrence === "none") {
    // Not a series — a single-occurrence delete is just a delete.
    return deleteEvent(eventId)
  }
  const next = Array.from(new Set([...(before.skipDates ?? []), occurrenceDate]))
  await db
    .update(studyEvent)
    .set({ skipDates: next })
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "event",
    entityId: eventId,
    entityLabel: `${before.title} (${occurrenceDate})`,
    before,
    after: { ...before, skipDates: next },
  })
  revalidatePath("/calendar")
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function deleteEvent(eventId: string) {
  const session = await requireSession()
  const before = await ownEvent(eventId, session.user.id)
  await db
    .delete(studyEvent)
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "event",
    entityId: eventId,
    entityLabel: before.title,
    before,
  })
  revalidatePath("/calendar")
  revalidatePath("/", "layout")
  return { ok: true as const }
}

/**
 * Imports events from an uploaded ICS file. Events whose (title, startsAt)
 * already exist are skipped so re-importing the same feed stays idempotent.
 */
export async function importIcsFile(formData: FormData) {
  const session = await requireSession()
  const file = formData.get("file")
  if (!(file instanceof File)) throw new Error("file required")
  if (file.size > 2 * 1024 * 1024) throw new Error("File too large (max 2 MB)")
  const moduleId = String(formData.get("moduleId") ?? "") || null
  if (moduleId) await ownModule(moduleId, session.user.id)

  const { parseIcs } = await import("@/lib/events/ics-import")
  const parsed = parseIcs(await file.text())
  if (parsed.length === 0) return { ok: true as const, imported: 0, skipped: 0 }

  const existing = await db.query.studyEvent.findMany({
    where: eq(studyEvent.userId, session.user.id),
    columns: { title: true, startsAt: true },
  })
  const seen = new Set(existing.map((e) => `${e.title}|${e.startsAt.getTime()}`))
  const fresh = parsed.filter((e) => !seen.has(`${e.title}|${e.startsAt.getTime()}`))

  if (fresh.length > 0) {
    await db.insert(studyEvent).values(
      fresh.map((e) => ({
        userId: session.user.id,
        moduleId,
        type: "other" as const,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        notes: e.notes,
        allDay: e.allDay,
        reminderOffsets: [],
        recurrence: e.recurrence,
        recurrenceUntil: e.recurrenceUntil,
        recurrenceWeekdays: e.recurrenceWeekdays,
        recurrenceInterval: e.recurrenceInterval,
      }))
    )
    await logAudit({
      userId: session.user.id,
      operation: "create",
      entityType: "event",
      entityId: "ics-import",
      entityLabel: `${file.name} (${fresh.length})`,
    })
  }
  revalidatePath("/calendar")
  return { ok: true as const, imported: fresh.length, skipped: parsed.length - fresh.length }
}

export async function regenerateIcsToken() {
  const session = await requireSession()
  const token = randomBytes(24).toString("base64url")
  await db
    .insert(userPrefs)
    .values({ userId: session.user.id, icsToken: token })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { icsToken: token } })
  revalidatePath("/calendar")
  return { ok: true as const, token }
}
