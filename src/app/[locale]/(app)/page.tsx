import { and, asc, eq, gte, isNull } from "drizzle-orm"
import { ArrowRight, CalendarDays } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { degreeProgram, learningGoal, studyEvent, studyPlan, studyTask } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { earnedEcts, formatGrade, programAverage } from "@/lib/grades"
import { getDashboardStats } from "@/lib/learning/stats-server"
import { getModuleOptions } from "@/lib/studies/module-options"
import { Link } from "@/i18n/navigation"
import { StatsCard } from "@/components/learn/stats-card"
import { GoalCard } from "@/components/learn/goal-card"
import { GoalDialog } from "@/components/learn/goal-dialog"
import { PlanDialog } from "@/components/learn/plan-dialogs"
import { TaskDialog } from "@/components/learn/task-dialog"
import { TaskRow } from "@/components/learn/task-row"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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

  const [events, programs, generalTasks, generalGoals, generalPlans, modules] =
    await Promise.all([
    db.query.studyEvent.findMany({
      where: (e, { and }) => and(eq(e.userId, session.user.id), gte(e.startsAt, new Date())),
      orderBy: [asc(studyEvent.startsAt)],
      limit: 5,
      with: { module: true },
    }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, session.user.id),
      with: { semesters: { with: { modules: { with: { grades: true } } } } },
    }),
    db.query.studyTask.findMany({
      where: and(eq(studyTask.userId, session.user.id), isNull(studyTask.moduleId)),
      orderBy: [asc(studyTask.status), asc(studyTask.dueDate)],
    }),
    db.query.learningGoal.findMany({
      where: and(eq(learningGoal.userId, session.user.id), isNull(learningGoal.moduleId)),
      orderBy: [asc(learningGoal.targetDate), asc(learningGoal.createdAt)],
    }),
    db.query.studyPlan.findMany({
      where: and(eq(studyPlan.userId, session.user.id), isNull(studyPlan.moduleId)),
      orderBy: [asc(studyPlan.createdAt)],
      with: { items: { columns: { id: true, done: true } } },
    }),
    getModuleOptions(session.user.id),
  ])
  const stats = await getDashboardStats(session.user.id)

  const openGeneralTasks = generalTasks.filter((t) => !t.parentId && t.status !== "done")

  const typeLabels = {
    exam: tCal("event.typeExam"),
    deadline: tCal("event.typeDeadline"),
    lecture: tCal("event.typeLecture"),
    other: tCal("event.typeOther"),
  } as const

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {t("greeting", { name: session.user.name.split(" ")[0] })}
      </h1>

      <StatsCard stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("upcoming")}</CardTitle>
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              {t("viewCalendar")}
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noUpcoming")}</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={typeVariant[e.type]}>{typeLabels[e.type]}</Badge>
                    <span className="font-medium">{e.title}</span>
                    <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                      <CalendarDays className="size-3" />
                      {format.dateTime(e.startsAt, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("programs")}</CardTitle>
            <Link
              href="/studies"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              {t("viewStudies")}
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {programs.length === 0 ? (
              <p className="text-muted-foreground text-sm">{tStudies("empty")}</p>
            ) : (
              <ul className="space-y-3">
                {programs.map((p) => {
                  const modules = p.semesters.flatMap((s) => s.modules)
                  const ects = earnedEcts(modules)
                  const avg = programAverage(modules)
                  const progress = p.targetEcts ? Math.min(100, (ects / p.targetEcts) * 100) : null
                  return (
                    <li key={p.id}>
                      <Link href={`/studies/${p.id}`} className="group block space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium group-hover:underline">{p.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {ects}
                            {p.targetEcts ? ` / ${p.targetEcts}` : ""} {tStudies("stats.ects")}
                            {avg != null &&
                              ` · Ø ${formatGrade(avg, p.gradingSystem)}`}
                          </span>
                        </div>
                        {progress != null && (
                          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("general")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <TaskDialog modules={modules} />
            <GoalDialog modules={modules} />
            <PlanDialog modules={modules} basePath="" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {openGeneralTasks.length === 0 &&
          generalGoals.length === 0 &&
          generalPlans.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("generalEmpty")}</p>
          ) : (
            <>
              {openGeneralTasks.length > 0 && (
                <ul className="space-y-1.5">
                  {openGeneralTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={{
                        id: task.id,
                        title: task.title,
                        notes: task.notes,
                        priority: task.priority,
                        status: task.status,
                        dueDate: task.dueDate,
                      }}
                    />
                  ))}
                </ul>
              )}
              {generalGoals.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {generalGoals.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={{
                        id: g.id,
                        title: g.title,
                        description: g.description,
                        progress: g.progress,
                        targetDate: g.targetDate,
                        moduleName: null,
                      }}
                    />
                  ))}
                </div>
              )}
              {generalPlans.length > 0 && (
                <ul className="space-y-1.5">
                  {generalPlans.map((plan) => {
                    const doneCount = plan.items.filter((i) => i.done).length
                    return (
                      <li
                        key={plan.id}
                        className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
                      >
                        <Link
                          href={`/plans/${plan.id}`}
                          className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                        >
                          {plan.title}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {doneCount}/{plan.items.length}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
