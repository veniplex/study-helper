"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { studyEvent, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

const eventSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum(["exam", "deadline", "lecture", "other"]),
  startsAt: z.string().datetime({ local: true }).or(z.string().datetime()),
  endsAt: z.string().datetime({ local: true }).or(z.string().datetime()).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  moduleId: z.string().optional().nullable(),
  reminderOffsets: z.array(z.number().int().positive()).default([]),
})

export async function createEvent(input: unknown) {
  const session = await requireSession()
  const data = eventSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  await db.insert(studyEvent).values({
    userId: session.user.id,
    title: data.title,
    type: data.type,
    startsAt: new Date(data.startsAt),
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    location: data.location ?? null,
    notes: data.notes ?? null,
    moduleId: data.moduleId || null,
    reminderOffsets: data.reminderOffsets,
  })
  revalidatePath("/calendar")
  return { ok: true as const }
}

export async function updateEvent(eventId: string, input: unknown) {
  const session = await requireSession()
  const data = eventSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  await db
    .update(studyEvent)
    .set({
      title: data.title,
      type: data.type,
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      moduleId: data.moduleId || null,
      reminderOffsets: data.reminderOffsets,
    })
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
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
  await db
    .update(studyEvent)
    .set({
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
    })
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
  revalidatePath("/calendar")
  return { ok: true as const }
}

export async function deleteEvent(eventId: string) {
  const session = await requireSession()
  await db
    .delete(studyEvent)
    .where(and(eq(studyEvent.id, eventId), eq(studyEvent.userId, session.user.id)))
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
