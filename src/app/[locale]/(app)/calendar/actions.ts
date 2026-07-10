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
})

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
  await db
    .update(studyEvent)
    .set({
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
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
  return { ok: true as const }
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
