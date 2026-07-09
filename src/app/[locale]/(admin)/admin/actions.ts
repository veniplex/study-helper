"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import { bustAuthCache } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
import {
  brandingSchema,
  oidcProvidersSchema,
  registrationModeSchema,
  setSetting,
  smtpSchema,
  socialProvidersSchema,
} from "@/lib/settings"

export async function saveRegistrationMode(mode: unknown) {
  await requireAdmin()
  await setSetting("auth.registrationMode", registrationModeSchema.parse(mode))
  bustAuthCache()
  revalidatePath("/", "layout")
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
