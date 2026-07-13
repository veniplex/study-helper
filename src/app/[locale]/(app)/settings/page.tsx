import { and, eq, gte, sum } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiUsageLog, notificationPrefs, passkey, userAiKey, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { listAvailableModels } from "@/lib/ai/registry"
import { getUserStorage } from "@/lib/materials/usage"
import { daysAgo, formatBytes } from "@/lib/utils"
import { AiKeySettings } from "@/components/settings/ai-key-settings"
import { AiModelCard } from "@/components/settings/ai-model-card"
import { LearningSettings } from "@/components/settings/learning-settings"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { ProfileSettings } from "@/components/settings/profile-settings"
import { SecuritySettings } from "@/components/settings/security-settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"

export default async function SettingsPage() {
  const session = await requireSession()
  const t = await getTranslations("settings")
  const thirtyDaysAgo = daysAgo(30)

  const [passkeys, ai, userKeys, usage, nPrefs, prefs, availableModels, uploads, storage] =
    await Promise.all([
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
    db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, session.user.id) }),
    listAvailableModels(),
    getSetting("uploads"),
    getUserStorage(session.user.id),
  ])

  const providers = (ai?.providers ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    hasUserKey: userKeys.some((k) => k.providerId === p.id),
  }))
  const totals = usage[0] ?? { inputTokens: 0, outputTokens: 0 }
  const limit = ai?.monthlyTokenLimitPerUser ?? 0
  const quotaMb = uploads?.storageQuotaMbPerUser ?? 0
  const quotaBytes = quotaMb * 1024 * 1024
  const storagePct =
    quotaBytes > 0 ? Math.min(100, Math.round((storage.totalBytes / quotaBytes) * 100)) : 0
  const defaultModelLabel =
    availableModels.models.find((m) => m.ref === availableModels.defaultModel)?.label ?? null

  return (
    <div className="space-y-6">
      <ProfileSettings
        initialName={session.user.name}
        initialImage={session.user.image ?? null}
        email={session.user.email}
      />
      <SecuritySettings
        twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
        passkeys={passkeys.map((p) => ({ ...p, createdAt: p.createdAt ?? new Date() }))}
      />
      <NotificationSettings
        email={session.user.email}
        initial={
          nPrefs?.channels ?? {
            events: {
              email: nPrefs?.emailReminders ?? true,
              push: nPrefs?.pushReminders ?? true,
            },
            assignments: {
              email: nPrefs?.emailReminders ?? true,
              push: nPrefs?.pushReminders ?? true,
            },
            dailyPlan: {
              email: nPrefs?.emailReminders ?? true,
              push: nPrefs?.pushReminders ?? true,
            },
          }
        }
      />
      <LearningSettings initialGoalMinutes={prefs?.weeklyGoalMinutes ?? null} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("storage.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-6">
            <div>
              <p className="text-muted-foreground text-xs">{t("storage.files")}</p>
              <p className="font-semibold tabular-nums">{storage.fileCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("storage.used")}</p>
              <p className="font-semibold tabular-nums">{formatBytes(storage.totalBytes) || "0 B"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("storage.quota")}</p>
              <p className="font-semibold tabular-nums">
                {quotaMb === 0 ? t("storage.unlimited") : formatBytes(quotaBytes)}
              </p>
            </div>
          </div>
          {quotaMb > 0 && (
            <div className="space-y-1">
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>{t("storage.utilization")}</span>
                <span className="tabular-nums">{storagePct}%</span>
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={storagePct >= 100 ? "bg-destructive h-full" : "bg-primary h-full"}
                  style={{ width: `${storagePct}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {providers.length === 0 && session.user.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("aiHint.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>{t("aiHint.description")}</p>
            <Link href="/admin/ai" className="text-foreground underline underline-offset-4">
              {t("aiHint.cta")}
            </Link>
          </CardContent>
        </Card>
      )}
      {providers.length > 0 && (
        <>
          {availableModels.models.length > 0 && (
            <AiModelCard
              models={availableModels.models}
              current={prefs?.preferredModel ?? null}
              defaultLabel={defaultModelLabel}
            />
          )}
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
        </>
      )}
    </div>
  )
}
