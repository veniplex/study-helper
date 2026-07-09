import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { passkey } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { SecuritySettings } from "@/components/settings/security-settings"

export default async function SettingsPage() {
  const session = await requireSession()
  const t = await getTranslations("settings")
  const passkeys = await db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
    .from(passkey)
    .where(eq(passkey.userId, session.user.id))

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
      <SecuritySettings
        twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
        passkeys={passkeys.map((p) => ({ ...p, createdAt: p.createdAt ?? new Date() }))}
      />
    </div>
  )
}
