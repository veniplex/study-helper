"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { moduleContact } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).optional().nullable().or(z.literal("")),
  role: z.string().max(200).optional().nullable(),
})

async function ownContact(contactId: string, userId: string) {
  const row = await db.query.moduleContact.findFirst({
    where: eq(moduleContact.id, contactId),
    with: { module: { with: { semester: { with: { program: true } } } } },
  })
  if (!row || row.module.semester.program.userId !== userId) throw new Error("Not found")
  return row
}

export async function createContact(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = contactSchema.parse(input)
  await db.insert(moduleContact).values({
    moduleId,
    name: data.name,
    email: data.email || null,
    role: data.role || null,
  })
  revalidatePath(`/studies/${mod.semester.programId}/${moduleId}`)
  return { ok: true as const }
}

export async function updateContact(contactId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownContact(contactId, session.user.id)
  const data = contactSchema.parse(input)
  await db
    .update(moduleContact)
    .set({ name: data.name, email: data.email || null, role: data.role || null })
    .where(eq(moduleContact.id, contactId))
  revalidatePath(`/studies/${row.module.semester.programId}/${row.moduleId}`)
  return { ok: true as const }
}

export async function deleteContact(contactId: string) {
  const session = await requireSession()
  const row = await ownContact(contactId, session.user.id)
  await db
    .delete(moduleContact)
    .where(and(eq(moduleContact.id, contactId), eq(moduleContact.moduleId, row.moduleId)))
  revalidatePath(`/studies/${row.module.semester.programId}/${row.moduleId}`)
  return { ok: true as const }
}
