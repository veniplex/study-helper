import { desc, eq } from "drizzle-orm"
import { Sparkles } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { studyPlan } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { getModuleOptions } from "@/lib/studies/module-options"
import { Link } from "@/i18n/navigation"
import { deletePlan } from "@/app/[locale]/(app)/learn/actions"
import { GeneratePlanDialog, PlanDialog } from "@/components/learn/plan-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"

export default async function PlansPage() {
  const session = await requireSession()
  const t = await getTranslations("learn.plans")

  const [plans, modules, { defaultModel }] = await Promise.all([
    db.query.studyPlan.findMany({
      where: eq(studyPlan.userId, session.user.id),
      orderBy: [desc(studyPlan.updatedAt)],
      with: { module: true, items: true },
    }),
    getModuleOptions(session.user.id),
    listAvailableModels(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <PlanDialog modules={modules} />
        <GeneratePlanDialog modules={modules} aiAvailable={Boolean(defaultModel)} />
      </div>
      {plans.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => {
            const doneCount = plan.items.filter((i) => i.done).length
            return (
              <li
                key={plan.id}
                className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
              >
                <Link
                  href={`/learn/plans/${plan.id}`}
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {plan.title}
                </Link>
                {plan.aiGenerated && (
                  <Badge variant="secondary">
                    <Sparkles className="size-3" />
                    {t("aiBadge")}
                  </Badge>
                )}
                {plan.module && <Badge variant="outline">{plan.module.name}</Badge>}
                <span className="text-muted-foreground text-xs">
                  {doneCount}/{plan.items.length} {t("items")}
                </span>
                <DeleteButton action={deletePlan.bind(null, plan.id)} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
