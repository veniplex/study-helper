import { desc, eq, gte, sql, sum } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiUsageLog, user } from "@/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { countStaleMaterials } from "@/lib/ai/reembed"
import { getSetting } from "@/lib/settings"
import { daysAgo } from "@/lib/utils"
import { AiSettingsForm } from "@/components/admin/ai-settings-form"
import { AnnIndexCard } from "@/components/admin/ann-index-card"
import { ReembedCard } from "@/components/admin/reembed-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminAiPage() {
  await requireAdmin()
  const t = await getTranslations("admin.ai")
  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel

  const thirtyDaysAgo = daysAgo(30)
  const [ann, reembed, staleCount, usage, usageByFeature] = await Promise.all([
    getSetting("ai.ann"),
    getSetting("ai.reembed"),
    embeddingRef ? countStaleMaterials(embeddingRef) : Promise.resolve(0),
    db
      .select({
        userName: user.name,
        inputTokens: sum(aiUsageLog.inputTokens).mapWith(Number),
        outputTokens: sum(aiUsageLog.outputTokens).mapWith(Number),
      })
      .from(aiUsageLog)
      .innerJoin(user, eq(aiUsageLog.userId, user.id))
      .where(gte(aiUsageLog.createdAt, thirtyDaysAgo))
      .groupBy(user.id, user.name)
      .orderBy(desc(sql`sum(${aiUsageLog.inputTokens} + ${aiUsageLog.outputTokens})`)),
    db
      .select({
        feature: aiUsageLog.feature,
        model: aiUsageLog.model,
        calls: sql<number>`count(*)::int`,
        inputTokens: sum(aiUsageLog.inputTokens).mapWith(Number),
        outputTokens: sum(aiUsageLog.outputTokens).mapWith(Number),
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, thirtyDaysAgo))
      .groupBy(aiUsageLog.feature, aiUsageLog.model)
      .orderBy(desc(sql`sum(${aiUsageLog.inputTokens} + ${aiUsageLog.outputTokens})`)),
  ])

  return (
    <div className="space-y-6">
      <AiSettingsForm
        initial={ai ?? { providers: [], monthlyTokenLimitPerUser: 0, useBatchApi: false }}
      />
      <ReembedCard
        initialState={reembed ?? { status: "idle" }}
        initialStaleCount={staleCount}
        embeddingConfigured={Boolean(embeddingRef)}
      />
      <AnnIndexCard
        initial={ann ?? { status: "idle" }}
        embeddingConfigured={Boolean(embeddingRef)}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usage")}</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("usageEmpty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">{t("usageUser")}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t("usageInput")}</th>
                  <th className="py-2 text-right font-medium">{t("usageOutput")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.userName} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.userName}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.outputTokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {usageByFeature.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("usageByFeature")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">{t("usageFeature")}</th>
                    <th className="py-2 pr-4 font-medium">{t("usageModel")}</th>
                    <th className="py-2 pr-4 text-right font-medium">{t("usageCalls")}</th>
                    <th className="py-2 pr-4 text-right font-medium">{t("usageInput")}</th>
                    <th className="py-2 text-right font-medium">{t("usageOutput")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usageByFeature.map((row) => (
                    <tr key={`${row.feature}-${row.model}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.feature}</td>
                      <td className="text-muted-foreground max-w-48 truncate py-2 pr-4">
                        {row.model}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.calls.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.inputTokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.outputTokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
