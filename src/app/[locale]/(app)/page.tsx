import * as React from "react"
import { asc, eq, gte, lte } from "drizzle-orm"
import { ArrowRight, CalendarDays, Check } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { assignment, degreeProgram, semesterPlan, studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { formatGrade, moduleGrade } from "@/lib/grades"
import { getDashboardStats, getPreparednessByModule } from "@/lib/learning/stats-server"
import { getStudyContext } from "@/lib/studies/context"
import { Link } from "@/i18n/navigation"
import { StatsCard } from "@/components/learn/stats-card"
import { TodayPlanCard } from "@/components/plan/today-plan-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const typeVariant = {
  exam: "destructive",
  deadline: "default",
  lecture: "secondary",
  other: "outline",
} as const

export default async function DashboardPage() {
  const session = await requireSession()
  const t = await getTranslations("dashboard")
  const tCal = await getTranslations("calendar")
  const tStudies = await getTranslations("studies")
  const format = await getFormatter()

  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + 7)
  const horizonKey = horizon.toISOString().slice(0, 10)
  const todayKey = now.toISOString().slice(0, 10)

  const [events, programs, dueAssignments, context] = await Promise.all([
    db.query.studyEvent.findMany({
      where: (e, { and }) =>
        and(eq(e.userId, session.user.id), gte(e.startsAt, now), lte(e.startsAt, horizon)),
      orderBy: [asc(studyEvent.startsAt)],
      with: { module: true },
    }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, session.user.id),
      with: { semesters: { with: { modules: { with: { grades: true } } } } },
    }),
    db.query.assignment.findMany({
      where: (a, { and, isNotNull, ne, gte: gteFn, lte: lteFn }) =>
        and(
          eq(a.userId, session.user.id),
          isNotNull(a.dueDate),
          ne(a.status, "graded"),
          gteFn(a.dueDate, todayKey),
          lteFn(a.dueDate, horizonKey)
        ),
      orderBy: [asc(assignment.dueDate)],
      with: { module: { columns: { name: true } } },
    }),
    getStudyContext(session.user.id),
  ])
  const stats = await getDashboardStats(session.user.id)

  const activeProgram = programs.find((p) => p.id === context.activeProgram?.id) ?? null
  const activeModuleIds =
    activeProgram?.semesters.flatMap((s) => s.modules.map((m) => m.id)) ?? []
  const preparedness = await getPreparednessByModule(session.user.id, activeModuleIds)

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

  const hasProgram = programs.length > 0
  const hasSemester = programs.some((p) => p.semesters.length > 0)
  const hasModule = programs.some((p) => p.semesters.some((s) => s.modules.length > 0))
  const onboardingSteps = [
    { key: "program", done: hasProgram },
    { key: "semester", done: hasSemester },
    { key: "module", done: hasModule },
  ] as const
  const tOnboarding = await getTranslations("onboarding")

  const typeLabels = {
    exam: tCal("event.typeExam"),
    deadline: tCal("event.typeDeadline"),
    lecture: tCal("event.typeLecture"),
    other: tCal("event.typeOther"),
  } as const

  function formatRange(start: string | null, end: string | null): string | null {
    if (!start && !end) return null
    const fmt = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" })
    if (start && end) return `${fmt(start)} – ${fmt(end)}`
    return fmt((start ?? end)!)
  }

  type AgendaItem =
    | {
        kind: "event"
        id: string
        title: string
        type: keyof typeof typeVariant
        at: Date
        allDay: boolean
        moduleName: string | null
      }
    | { kind: "assignment"; id: string; title: string; moduleName: string }

  const dayKeyOf = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  const labelToday = dayKeyOf(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const labelTomorrow = dayKeyOf(tomorrow)

  const agendaMap = new Map<string, AgendaItem[]>()
  for (const e of events) {
    const k = dayKeyOf(e.startsAt)
    const arr = agendaMap.get(k) ?? []
    arr.push({
      kind: "event",
      id: e.id,
      title: e.title,
      type: e.type,
      at: e.startsAt,
      allDay: e.allDay,
      moduleName: e.module?.name ?? null,
    })
    agendaMap.set(k, arr)
  }
  for (const a of dueAssignments) {
    const k = a.dueDate!
    const arr = agendaMap.get(k) ?? []
    arr.push({ kind: "assignment", id: a.id, title: a.title, moduleName: a.module.name })
    agendaMap.set(k, arr)
  }
  const agendaDays = [...agendaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      items: items.sort((x, y) => {
        const ax = x.kind === "event" && !x.allDay ? x.at.getTime() : 0
        const ay = y.kind === "event" && !y.allDay ? y.at.getTime() : 0
        return ax - ay
      }),
    }))

  const dayLabel = (key: string): string => {
    if (key === labelToday) return t("today")
    if (key === labelTomorrow) return t("tomorrow")
    return format.dateTime(new Date(`${key}T00:00`), {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {t("greeting", { name: session.user.name.split(" ")[0] })}
      </h1>

      {!hasModule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tOnboarding("title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">{tOnboarding("intro")}</p>
            <ol className="space-y-2">
              {onboardingSteps.map((step, i) => (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      step.done
                        ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                        : "bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    }
                  >
                    {step.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={step.done ? "text-muted-foreground line-through" : "font-medium"}>
                    {tOnboarding(`step_${step.key}`)}
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href={hasProgram ? `/studies/${programs[0]!.id}` : "/studies"}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {tOnboarding("cta")}
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      <StatsCard stats={stats} />

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("next7Days")}</CardTitle>
          <Link
            href="/calendar"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            {t("viewCalendar")}
            <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {agendaDays.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noUpcoming")}</p>
          ) : (
            <div className="space-y-4">
              {agendaDays.map((day) => (
                <div key={day.key} className="space-y-2">
                  <p className="text-muted-foreground border-b pb-1 text-xs font-semibold tracking-wide capitalize">
                    {dayLabel(day.key)}
                  </p>
                  <ul className="space-y-2">
                    {day.items.map((item) =>
                      item.kind === "event" ? (
                        <li
                          key={`e-${item.id}`}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <Badge variant={typeVariant[item.type]}>{typeLabels[item.type]}</Badge>
                          <span className="font-medium">{item.title}</span>
                          {item.moduleName && (
                            <span className="text-muted-foreground text-xs">{item.moduleName}</span>
                          )}
                          <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs tabular-nums">
                            <CalendarDays className="size-3" />
                            {item.allDay ? t("allDay") : format.dateTime(item.at, { timeStyle: "short" })}
                          </span>
                        </li>
                      ) : (
                        <li
                          key={`a-${item.id}`}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <Badge variant="default">{t("assignmentDue")}</Badge>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-muted-foreground text-xs">{item.moduleName}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeProgram &&
        activeProgram.semesters.map((sem) => (
          <Card key={sem.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{sem.name}</CardTitle>
                {formatRange(sem.startDate, sem.endDate) && (
                  <p className="text-muted-foreground text-xs">
                    {formatRange(sem.startDate, sem.endDate)}
                  </p>
                )}
              </div>
              <Link
                href={`/plan/${sem.id}`}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                {t("toPlan")}
                <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {sem.modules.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("noModules")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[32rem] grid-cols-[1fr_4rem_4rem_11rem] items-center gap-x-3 gap-y-2 text-sm">
                    <span />
                    <span className="text-muted-foreground text-right text-xs font-medium">
                      {tStudies("stats.ects")}
                    </span>
                    <span className="text-muted-foreground text-right text-xs font-medium">
                      {t("columnGrade")}
                    </span>
                    <span
                      className="text-muted-foreground text-xs font-medium"
                      title={t("preparednessHint")}
                    >
                      {t("columnPreparedness")}
                    </span>
                    {sem.modules.map((mod) => {
                      const grade = moduleGrade(mod.grades)
                      const prep = preparedness.get(mod.id) ?? null
                      return (
                        <React.Fragment key={mod.id}>
                          <Link
                            href={`/studies/${activeProgram.id}/${mod.id}`}
                            className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                          >
                            {mod.name}
                          </Link>
                          <span className="text-muted-foreground text-right text-xs tabular-nums">
                            {mod.ects ?? "–"}
                          </span>
                          <span className="text-muted-foreground text-right text-xs tabular-nums">
                            {grade != null
                              ? formatGrade(grade, activeProgram.gradingSystem)
                              : "–"}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                              {prep != null && (
                                <span
                                  className="bg-primary block h-full rounded-full"
                                  style={{ width: `${prep}%` }}
                                />
                              )}
                            </span>
                            <span
                              className="text-muted-foreground w-9 text-right text-xs tabular-nums"
                              title={t("preparednessHint")}
                            >
                              {prep != null ? `${prep}%` : "–"}
                            </span>
                          </span>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
    </div>
  )
}
