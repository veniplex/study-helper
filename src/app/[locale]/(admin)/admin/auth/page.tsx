import { requireAdmin } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { env } from "@/lib/env"
import { AuthSettingsForm } from "@/components/admin/auth-settings-form"

export default async function AdminAuthPage() {
  await requireAdmin()
  const [registrationMode, social, oidc] = await Promise.all([
    getSetting("auth.registrationMode"),
    getSetting("auth.socialProviders"),
    getSetting("auth.oidcProviders"),
  ])

  return (
    <AuthSettingsForm
      appUrl={env.APP_URL}
      initial={{
        registrationMode: registrationMode ?? "open",
        social: social ?? {},
        oidc: oidc ?? [],
      }}
    />
  )
}
