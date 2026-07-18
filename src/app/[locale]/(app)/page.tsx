import { getTranslations } from "next-intl/server"
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm"
import { db } from "@/db"
import { planSession, semesterPlan, studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { getDashboardStats, getPreparednessByModule } from "@/lib/learning/stats-server"
import { getModuleFinalGrades } from "@/lib/studies/grades-server"
import { getStudyContext } from "@/lib/studies/context"
import type { MiniCalendarEvent } from "@/app/[locale]/(app)/dashboard-actions"
import { MiniCalendar } from "@/components/learn/mini-calendar"
import { TodayFocusCard, type NextExam } from "@/components/learn/today-focus-card"
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
  const userPlans = await db.query.semesterPlan.findMany({
    where: eq(semesterPlan.userId, session.user.id),
    columns: { id: true },
  })
  const todayPlanSessions = userPlans.length
    ? await db.query.planSession.findMany({
        where: and(
          inArray(
            planSession.semesterPlanId,
            userPlans.map((p) => p.id)
          ),
          eq(planSession.date, today)
        ),
        orderBy: [asc(planSession.startTime)],
        with: {
          module: { columns: { name: true } },
          semesterPlan: { columns: { semesterId: true } },
          tasks: {
            orderBy: (task, { asc: ascFn }) => [ascFn(task.sortOrder)],
            columns: { id: true, title: true, done: true },
          },
        },
      })
    : []

  // Next upcoming exam of the active program's modules, with its preparedness.
  const nextExamRow = await db.query.studyEvent.findFirst({
    where: and(
      eq(studyEvent.userId, session.user.id),
      eq(studyEvent.type, "exam"),
      gte(studyEvent.startsAt, new Date())
    ),
    orderBy: [asc(studyEvent.startsAt)],
    with: { module: { columns: { id: true, name: true } } },
  })
  const nextExam: NextExam | null = nextExamRow
    ? {
        title: nextExamRow.title,
        startsAt: nextExamRow.startsAt,
        moduleName: nextExamRow.module?.name ?? null,
        daysUntil: Math.max(
          0,
          Math.ceil((nextExamRow.startsAt.getTime() - now.getTime()) / 86_400_000)
        ),
        preparedness: nextExamRow.module
          ? (preparedness.get(nextExamRow.module.id) ?? null)
          : null,
      }
    : null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {t("greeting", { name: firstName })}
      </h1>

      <TodayFocusCard
        dueCards={stats.dueToday}
        openPlanItems={todayPlanSessions.filter((s) => !s.done).length}
        nextExam={nextExam}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsCard stats={stats} />
        <MiniCalendar
          initialEvents={initialEvents}
          year={now.getFullYear()}
          month={now.getMonth()}
        />
      </div>

      <TodayPlanCard
        items={todayPlanSessions.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
          done: s.done,
          moduleName: s.module?.name ?? null,
          semesterId: s.semesterPlan.semesterId,
          tasks: s.tasks.map((task) => ({ id: task.id, title: task.title, done: task.done })),
        }))}
      />

      {activeProgram && programInfo && (
        <SemesterOverviewCard
          programId={activeProgram.id}
          gradingSystem={programInfo.gradingSystem}
          targetEcts={programInfo.targetEcts}
          gradeGoal={programInfo.gradeGoal}
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
