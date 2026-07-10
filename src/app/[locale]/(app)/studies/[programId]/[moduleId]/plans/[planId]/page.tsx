import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { studyPlan, studyPlanItem } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { AddPlanItemForm } from "@/components/learn/plan-dialogs"
import { PlanItemList } from "@/components/learn/plan-item-list"

export default async function ModulePlanDetailPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string; planId: string }>
}) {
  const { moduleId, planId } = await params
  const session = await requireSession()

  const plan = await db.query.studyPlan.findFirst({
    where: and(eq(studyPlan.id, planId), eq(studyPlan.userId, session.user.id)),
    with: {
      items: { orderBy: [asc(studyPlanItem.sortOrder), asc(studyPlanItem.scheduledDate)] },
    },
  })
  if (!plan || plan.moduleId !== moduleId) notFound()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{plan.title}</h2>
        {plan.description && (
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {plan.description}
          </p>
        )}
      </div>
      <PlanItemList planId={plan.id} items={plan.items} />
      <AddPlanItemForm planId={plan.id} />
    </div>
  )
}
