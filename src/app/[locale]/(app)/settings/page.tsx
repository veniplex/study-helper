import { and, eq, gte, sum } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiUsageLog, notificationPrefs, passkey, userAiKey } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { daysAgo } from "@/lib/utils"
import { AiKeySettings } from "@/components/settings/ai-key-settings"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { ProfileSettings } from "@/components/settings/profile-settings"
import { SecuritySettings } from "@/components/settings/security-settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SettingsPage() {
  const session = await requireSession()
  const t = await getTranslations("settings")
  const thirtyDaysAgo = daysAgo(30)

  const [passkeys, ai, userKeys, usage, nPrefs] = await Promise.all([
    db
      .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt })
      .from(passkey)
      .where(eq(passkey.userId, session.user.id)),
    getSetting("ai"),
    db.query.userAiKey.findMany({ where: eq(userAiKey.userId, session.user.id) }),
    db
      .select({
        inputTokens: sum(aiUsageLog.inputTokens).mapWith(Number),
        outputTokens: sum(aiUsageLog.outputTokens).mapWith(Number),
      })
      .from(aiUsageLog)
      .where(
        and(eq(aiUsageLog.userId, session.user.id), gte(aiUsageLog.createdAt, thirtyDaysAgo))
      ),
    db.query.notificationPrefs.findFirst({
      where: eq(notificationPrefs.userId, session.user.id),
    }),
  ])

  const providers = (ai?.providers ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    hasUserKey: userKeys.some((k) => k.providerId === p.id),
  }))
  const totals = usage[0] ?? { inputTokens: 0, outputTokens: 0 }
  const limit = ai?.monthlyTokenLimitPerUser ?? 0

  return (
    <div className="space-y-6">
      <ProfileSettings
        initialName={session.user.name}
        initialImage={session.user.image ?? null}
      />
      <SecuritySettings
        twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
        passkeys={passkeys.map((p) => ({ ...p, createdAt: p.createdAt ?? new Date() }))}
      />
      <NotificationSettings
        initial={{
          emailReminders: nPrefs?.emailReminders ?? true,
          pushReminders: nPrefs?.pushReminders ?? true,
        }}
      />
      <AiKeySettings providers={providers} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usage.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">{t("usage.input")}</p>
            <p className="font-semibold tabular-nums">
              {(totals.inputTokens ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("usage.output")}</p>
            <p className="font-semibold tabular-nums">
              {(totals.outputTokens ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t("usage.limit")}</p>
            <p className="font-semibold tabular-nums">
              {limit === 0 ? t("usage.unlimited") : limit.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
