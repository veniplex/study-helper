import { getTranslations } from "next-intl/server"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db"
import { semesterPlan, studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { getDashboardStats, getPreparednessByModule } from "@/lib/learning/stats-server"
import { getModuleFinalGrades } from "@/lib/studies/grades-server"
import { getStudyContext } from "@/lib/studies/context"
import type { MiniCalendarEvent } from "@/app/[locale]/(app)/dashboard-actions"
import { MiniCalendar } from "@/components/learn/mini-calendar"
import { OnboardingWizard } from "@/components/learn/onboarding-wizard"
import { SemesterOverviewCard } from "@/components/learn/semester-overview-card"
import { StatsCard } from "@/components/learn/stats-card"
import { TodayPlanCard } from "@/components/plan/today-plan-card"

export default async function DashboardPage() {
  const session = await requireSession()
  const t = await getTranslations("dashboard")

  const context = await getStudyContext(session.user.id)
  const activeProgram = context.activeProgram
  const programInfo = context.programs.find((p) => p.id === activeProgram?.id) ?? null

  const activeModuleIdsEarly = context.tree.flatMap((s) => s.modules.map((m) => m.id))
  const firstName = session.user.name.split(" ")[0]

  // Brand-new users (no module yet) get a focused onboarding flow instead of a
  // dashboard full of empty widgets.
  if (activeModuleIdsEarly.length === 0) {
    const aiConfigured = await isAiAvailable()
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          {t("greeting", { name: firstName })}
        </h1>
        <OnboardingWizard
          name={firstName}
          hasProgram={context.programs.length > 0}
          hasSemester={context.tree.length > 0}
          hasModule={false}
          programId={activeProgram?.id ?? null}
          semesterId={context.tree[0]?.id ?? null}
          isAdmin={session.user.role === "admin"}
          aiConfigured={aiConfigured}
        />
      </div>
    )
  }

  const stats = await getDashboardStats(session.user.id)

  // Mini-calendar: events of the current month (component fetches others on nav).
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const monthEvents = await db.query.studyEvent.findMany({
    where: and(
      eq(studyEvent.userId, session.user.id),
      gte(studyEvent.startsAt, monthStart),
      lte(studyEvent.startsAt, monthEnd)
    ),
    orderBy: [asc(studyEvent.startsAt)],
    with: { module: { columns: { name: true, icon: true, color: true } } },
  })
  const initialEvents: MiniCalendarEvent[] = monthEvents.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
    allDay: e.allDay,
    aiGenerated: e.aiGenerated,
    moduleName: e.module?.name ?? null,
    moduleIcon: e.module?.icon ?? null,
    moduleColor: e.module?.color ?? null,
  }))

  // Semester overview data (from the active program's tree).
  const activeModuleIds = context.tree.flatMap((s) => s.modules.map((m) => m.id))
  const [finalGrades, preparedness] = await Promise.all([
    activeProgram ? getModuleFinalGrades(activeProgram.id) : Promise.resolve(new Map()),
    getPreparednessByModule(session.user.id, activeModuleIds),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const todayPlanItems = await db.query.semesterPlanItem.findMany({
    where: (item, { exists, and: a, eq: e }) =>
      a(
        e(item.date, today),
        exists(
          db
            .select()
            .from(semesterPlan)
            .where(a(e(semesterPlan.id, item.planId), e(semesterPlan.userId, session.user.id)))
        )
      ),
    orderBy: (item, { asc: ascFn }) => [ascFn(item.startTime)],
    with: {
      module: { columns: { name: true } },
      plan: { columns: { semesterId: true } },
    },
  })

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {t("greeting", { name: firstName })}
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsCard stats={stats} />
        <MiniCalendar
          initialEvents={initialEvents}
          year={now.getFullYear()}
          month={now.getMonth()}
        />
      </div>

      <TodayPlanCard
        items={todayPlanItems.map((i) => ({
          id: i.id,
          title: i.title,
          startTime: i.startTime,
          durationMinutes: i.durationMinutes,
          done: i.done,
          moduleName: i.module?.name ?? null,
          semesterId: i.plan.semesterId,
        }))}
      />

      {activeProgram && programInfo && (
        <SemesterOverviewCard
          programId={activeProgram.id}
          gradingSystem={programInfo.gradingSystem}
          targetEcts={programInfo.targetEcts}
          currentSemesterId={context.currentSemesterId}
          semesters={context.tree.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
            modules: s.modules,
          }))}
          finalGrades={finalGrades}
          preparedness={preparedness}
        />
      )}
    </div>
  )
}
