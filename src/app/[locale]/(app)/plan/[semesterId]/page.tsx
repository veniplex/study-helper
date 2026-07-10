import { asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { semesterPlan, semesterPlanItem } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownSemester } from "@/lib/studies/access"
import { AvailabilityEditor } from "@/components/plan/availability-editor"
import { PlanItems } from "@/components/plan/plan-items"

export default async function SemesterPlanPage({
  params,
}: {
  params: Promise<{ semesterId: string }>
}) {
  const { semesterId } = await params
  const session = await requireSession()
  const sem = await ownSemester(semesterId, session.user.id)
  const t = await getTranslations("semesterPlan")

  const plan = await db.query.semesterPlan.findFirst({
    where: eq(semesterPlan.semesterId, semesterId),
    with: {
      items: {
        orderBy: [asc(semesterPlanItem.date), asc(semesterPlanItem.startTime)],
        with: { module: { columns: { name: true } } },
      },
    },
  })

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {sem.program.name} · {sem.name}
        </p>
      </div>

      <AvailabilityEditor
        semesterId={semesterId}
        initial={plan?.availability ?? null}
        hasPlan={Boolean(plan?.generatedAt)}
      />

      <PlanItems
        items={(plan?.items ?? []).map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          date: i.date,
          startTime: i.startTime,
          durationMinutes: i.durationMinutes,
          done: i.done,
          moduleName: i.module?.name ?? null,
        }))}
      />
    </div>
  )
}
