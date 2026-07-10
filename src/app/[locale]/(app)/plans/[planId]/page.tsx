import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { studyPlan, studyPlanItem } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { AddPlanItemForm } from "@/components/learn/plan-dialogs"
import { PlanItemRow } from "@/components/learn/plan-item-row"

export default async function GeneralPlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  const { planId } = await params
  const session = await requireSession()

  const plan = await db.query.studyPlan.findFirst({
    where: and(eq(studyPlan.id, planId), eq(studyPlan.userId, session.user.id)),
    with: {
      items: { orderBy: [asc(studyPlanItem.scheduledDate), asc(studyPlanItem.sortOrder)] },
    },
  })
  if (!plan) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{plan.title}</h1>
        {plan.description && (
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {plan.description}
          </p>
        )}
      </div>
      <ul className="space-y-1.5">
        {plan.items.map((item) => (
          <PlanItemRow key={item.id} item={item} />
        ))}
      </ul>
      <AddPlanItemForm planId={plan.id} />
    </div>
  )
}
