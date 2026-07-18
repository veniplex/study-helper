"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { invite } from "@/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { bustAuthCache } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
import {
  aiSettingsSchema,
  brandingSchema,
  oidcProvidersSchema,
  registrationModeSchema,
  setSetting,
  smtpSchema,
  socialProvidersSchema,
  uploadsSchema,
} from "@/lib/settings"

export async function saveRegistrationMode(mode: unknown) {
  await requireAdmin()
  await setSetting("auth.registrationMode", registrationModeSchema.parse(mode))
  bustAuthCache()
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
})

export async function createInvite(input: unknown) {
  const session = await requireAdmin()
  const data = createInviteSchema.parse(input)
  const token = randomBytes(24).toString("base64url")
  const [created] = await db
    .insert(invite)
    .values({
      token,
      createdBy: session.user.id,
      maxUses: data.maxUses,
      expiresAt: data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    })
    .returning({ id: invite.id, token: invite.token })
  revalidatePath("/admin/auth")
  return { ok: true as const, id: created.id, token: created.token }
}

export async function deleteInvite(inviteId: string) {
  await requireAdmin()
  await db.delete(invite).where(eq(invite.id, inviteId))
  revalidatePath("/admin/auth")
  return { ok: true as const }
}

export async function saveSocialProviders(value: unknown) {
  await requireAdmin()
  await setSetting("auth.socialProviders", socialProvidersSchema.parse(value))
  bustAuthCache()
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function saveOidcProviders(value: unknown) {
  await requireAdmin()
  await setSetting("auth.oidcProviders", oidcProvidersSchema.parse(value))
  bustAuthCache()
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function saveSmtp(value: unknown) {
  await requireAdmin()
  await setSetting("smtp", smtpSchema.parse(value))
  return { ok: true as const }
}

export async function sendTestEmail() {
  const session = await requireAdmin()
  try {
    await sendEmail({
      to: session.user.email,
      subject: "StudyHelper test email",
      text: "SMTP is configured correctly. 🎉",
    })
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "unknown" }
  }
}

export async function saveBranding(value: unknown) {
  await requireAdmin()
  await setSetting("branding", brandingSchema.parse(value))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function saveUploads(value: unknown) {
  await requireAdmin()
  await setSetting("uploads", uploadsSchema.parse(value))
  return { ok: true as const }
}

export async function saveAiSettings(value: unknown) {
  await requireAdmin()
  const { getSetting } = await import("@/lib/settings")
  const previous = await getSetting("ai")
  const next = aiSettingsSchema.parse(value)
  await setSetting("ai", next)
  // A changed embedding model orphans every existing chunk (vector search
  // filters on the active model ref) — kick off the re-embed backfill so
  // search doesn't silently go dark.
  if (
    next.defaultEmbeddingModel &&
    previous?.defaultEmbeddingModel !== next.defaultEmbeddingModel
  ) {
    try {
      const { enqueueReembedMaterials } = await import("@/lib/jobs")
      await enqueueReembedMaterials()
    } catch (error) {
      console.error("[admin] failed to enqueue re-embed after model change", error)
    }
  }
  revalidatePath("/", "layout")
  return { ok: true as const }
}

/** Kicks off a background rebuild of the pgvector HNSW ANN index. */
export async function startVectorReindex() {
  await requireAdmin()
  const { enqueueReindexVectors } = await import("@/lib/jobs")
  await enqueueReindexVectors()
  return { ok: true as const }
}

/** Current ANN index state (status/model/dimensions), for the admin UI. */
export async function getAnnStatus() {
  await requireAdmin()
  const { getSetting } = await import("@/lib/settings")
  return (await getSetting("ai.ann")) ?? { status: "idle" as const }
}

/** Fires a one-token test request against a (possibly unsaved) provider config. */
export async function testAiProvider(value: unknown) {
  await requireAdmin()
  const { aiProviderSchema } = await import("@/lib/settings")
  const provider = aiProviderSchema.parse(value)
  const { testProviderConnection } = await import("@/lib/ai/registry")
  return testProviderConnection(provider, provider.apiKey)
}

/** Starts the re-embed backfill for materials embedded with a stale model. */
export async function startReembed() {
  await requireAdmin()
  const { enqueueReembedMaterials } = await import("@/lib/jobs")
  await enqueueReembedMaterials()
  return { ok: true as const }
}

/** Re-embed progress + live count of stale materials, for the admin UI. */
export async function getReembedStatus() {
  await requireAdmin()
  const { getSetting } = await import("@/lib/settings")
  const [state, ai] = await Promise.all([getSetting("ai.reembed"), getSetting("ai")])
  const ref = ai?.defaultEmbeddingModel
  let staleCount = 0
  if (ref) {
    const { countStaleMaterials } = await import("@/lib/ai/reembed")
    staleCount = await countStaleMaterials(ref)
  }
  return { state: state ?? { status: "idle" as const }, staleCount, embeddingModel: ref ?? null }
}
