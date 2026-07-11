"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { userAiKey, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { encrypt } from "@/lib/crypto"
import { listAvailableModels } from "@/lib/ai/registry"

const keySchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().min(1).max(500),
})

export async function saveUserAiKey(input: unknown) {
  const session = await requireSession()
  const { providerId, apiKey } = keySchema.parse(input)
  const encrypted = encrypt(apiKey)
  const existing = await db.query.userAiKey.findFirst({
    where: and(eq(userAiKey.userId, session.user.id), eq(userAiKey.providerId, providerId)),
  })
  if (existing) {
    await db
      .update(userAiKey)
      .set({ encryptedKey: encrypted })
      .where(eq(userAiKey.id, existing.id))
  } else {
    await db.insert(userAiKey).values({
      userId: session.user.id,
      providerId,
      encryptedKey: encrypted,
    })
  }
  revalidatePath("/settings")
  return { ok: true as const }
}

export async function saveNotificationPrefs(input: unknown) {
  const session = await requireSession()
  const channelSchema = z.object({ email: z.boolean(), push: z.boolean() })
  const channels = z
    .object({
      events: channelSchema,
      assignments: channelSchema,
      dailyPlan: channelSchema,
    })
    .parse(input)
  const { notificationPrefs } = await import("@/db/schema")
  const data = {
    channels,
    // keep the legacy booleans in sync as a coarse fallback
    emailReminders:
      channels.events.email || channels.assignments.email || channels.dailyPlan.email,
    pushReminders:
      channels.events.push || channels.assignments.push || channels.dailyPlan.push,
  }
  await db
    .insert(notificationPrefs)
    .values({ userId: session.user.id, ...data })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: data })
  revalidatePath("/settings")
  return { ok: true as const }
}

/** Sets the user's preferred AI model. Empty string clears it (= global default). */
export async function updatePreferredModel(ref: string) {
  const session = await requireSession()
  let value: string | null = null
  if (ref) {
    const { models } = await listAvailableModels()
    if (!models.some((m) => m.ref === ref)) throw new Error("Unknown model")
    value = ref
  }
  await db
    .insert(userPrefs)
    .values({ userId: session.user.id, preferredModel: value })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { preferredModel: value } })
  revalidatePath("/settings")
  return { ok: true as const }
}

export async function deleteUserAiKey(providerId: string) {
  const session = await requireSession()
  await db
    .delete(userAiKey)
    .where(and(eq(userAiKey.userId, session.user.id), eq(userAiKey.providerId, providerId)))
  revalidatePath("/settings")
  return { ok: true as const }
}
