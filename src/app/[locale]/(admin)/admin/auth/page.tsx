import { desc } from "drizzle-orm"
import { db } from "@/db"
import { invite } from "@/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { env } from "@/lib/env"
import { AuthSettingsForm } from "@/components/admin/auth-settings-form"
import { InviteManager } from "@/components/admin/invite-manager"

export default async function AdminAuthPage() {
  await requireAdmin()
  const [registrationMode, social, oidc, invites] = await Promise.all([
    getSetting("auth.registrationMode"),
    getSetting("auth.socialProviders"),
    getSetting("auth.oidcProviders"),
    db.query.invite.findMany({ orderBy: [desc(invite.createdAt)] }),
  ])

  return (
    <div className="space-y-6">
      <AuthSettingsForm
        appUrl={env.APP_URL}
        initial={{
          registrationMode: registrationMode ?? "open",
          social: social ?? {},
          oidc: oidc ?? [],
        }}
      />
      <InviteManager appUrl={env.APP_URL} invites={invites} />
    </div>
  )
}
