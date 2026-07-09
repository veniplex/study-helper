import { asc, eq, gte } from "drizzle-orm"
import { ArrowRight, CalendarDays } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { degreeProgram, studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { earnedEcts, formatGrade, programAverage } from "@/lib/grades"
import { Link } from "@/i18n/navigation"
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

  const [events, programs] = await Promise.all([
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
  ])

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
    </div>
  )
}
