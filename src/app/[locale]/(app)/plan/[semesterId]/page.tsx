import { and, asc, eq, gte, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { modulePlan, planSession, semesterPlan, studyModule } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownSemester } from "@/lib/studies/access"
import { AvailabilityEditor } from "@/components/plan/availability-editor"
import { StrategyBoard, type StrategyModule } from "@/components/plan/strategy-board"

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
    columns: { id: true, availability: true, generatedAt: true },
  })

  const modules = await db.query.studyModule.findMany({
    where: eq(studyModule.semesterId, semesterId),
    orderBy: [asc(studyModule.name)],
    columns: { id: true, name: true },
  })
  const moduleIds = modules.map((m) => m.id)

  const plans = moduleIds.length
    ? await db.query.modulePlan.findMany({
        where: inArray(modulePlan.moduleId, moduleIds),
      })
    : []
  const planByModule = new Map(plans.map((p) => [p.moduleId, p]))

  const today = new Date().toISOString().slice(0, 10)
  const sessions = plan
    ? await db.query.planSession.findMany({
        where: and(eq(planSession.semesterPlanId, plan.id), gte(planSession.date, today)),
        orderBy: [asc(planSession.date), asc(planSession.startTime)],
        with: {
          module: { columns: { name: true } },
          tasks: { columns: { id: true } },
        },
      })
    : []

  const strategyModules: StrategyModule[] = modules.map((m) => {
    const mp = planByModule.get(m.id)
    return {
      moduleId: m.id,
      name: m.name,
      active: mp?.active ?? true,
      weight: mp ? Number(mp.weight) : 1,
      weeklyHoursTarget:
        mp?.weeklyHoursTarget == null ? null : Number(mp.weeklyHoursTarget),
      phase: mp?.phase ?? 1,
      preferredWeekdays: mp?.preferredWeekdays ?? null,
    }
  })

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {sem.program.name} · {sem.name}
        </p>
      </div>

      <AvailabilityEditor semesterId={semesterId} initial={plan?.availability ?? null} />

      <StrategyBoard
        semesterId={semesterId}
        hasAvailability={Boolean(plan)}
        modules={strategyModules}
        sessions={sessions.map((s) => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
          done: s.done,
          moduleName: s.module?.name ?? null,
          taskCount: s.tasks.length,
        }))}
      />
    </div>
  )
}
