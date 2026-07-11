import { Settings } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import type { FinalGrade } from "@/lib/grades"
import { formatGrade, programAverageFromFinals } from "@/lib/grades"
import type { GradingSystem } from "@/db/schema/studies"
import type { SemesterModule } from "@/lib/studies/context"
import { GradeGoal } from "@/components/learn/grade-goal"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { SemesterModulesBoard, type BoardSemester } from "@/components/learn/semester-modules-board"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"

type SemesterRow = {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  modules: SemesterModule[]
}

export async function SemesterOverviewCard({
  programId,
  gradingSystem,
  targetEcts,
  semesters,
  finalGrades,
  preparedness,
  currentSemesterId,
}: {
  programId: string
  gradingSystem: GradingSystem
  targetEcts: number | null
  semesters: SemesterRow[]
  finalGrades: Map<string, FinalGrade>
  preparedness: Map<string, number | null>
  currentSemesterId: string | null
}) {
  const t = await getTranslations("dashboard")
  const tStudies = await getTranslations("studies")
  const format = await getFormatter()

  const allModules = semesters.flatMap((s) => s.modules)
  const earnedEcts = allModules
    .filter((m) => m.status === "passed")
    .reduce((sum, m) => sum + (m.ects ?? 0), 0)
  const average = programAverageFromFinals(
    allModules.map((m) => ({ finalGrade: finalGrades.get(m.id)?.grade ?? null, ects: m.ects }))
  )
  const gradedEcts = allModules
    .filter((m) => finalGrades.get(m.id)?.grade != null)
    .reduce((sum, m) => sum + (m.ects ?? 0), 0)

  const stats: { label: string; value: string }[] = [
    {
      label: tStudies("stats.ects"),
      value: `${earnedEcts}${targetEcts ? ` / ${targetEcts}` : ""}`,
    },
    { label: tStudies("stats.average"), value: average != null ? formatGrade(average, gradingSystem) : "–" },
    { label: tStudies("stats.modules"), value: String(allModules.length) },
    { label: tStudies("stats.semesters"), value: String(semesters.length) },
  ]

  const gradeLabel = new Map<string, string>()
  for (const m of allModules) {
    const final = finalGrades.get(m.id)
    const label = !final
      ? "–"
      : m.passFail
        ? final.passed == null
          ? "–"
          : final.passed
            ? "✓"
            : "✗"
        : final.grade != null
          ? formatGrade(final.grade, gradingSystem)
          : "–"
    gradeLabel.set(m.id, label)
  }

  function dateRangeLabel(s: SemesterRow): string | null {
    if (!s.startDate && !s.endDate) return null
    const fmt = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" })
    if (s.startDate && s.endDate) return `${fmt(s.startDate)} – ${fmt(s.endDate)}`
    return fmt((s.startDate ?? s.endDate)!)
  }

  const boardSemesters: BoardSemester[] = semesters.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    dateRangeLabel: dateRangeLabel(s),
    isCurrent: s.id === currentSemesterId,
    modules: s.modules,
  }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-3">
          <CardTitle className="text-base">{t("semesterOverview")}</CardTitle>
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-muted-foreground text-xs">{s.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/studies/${programId}/settings`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <Settings className="size-3.5" />
            {t("programSettings")}
          </Link>
          <SemesterDialog programId={programId} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {gradingSystem === "german" && targetEcts != null && targetEcts > gradedEcts && (
          <GradeGoal average={average} gradedEcts={gradedEcts} targetEcts={targetEcts} />
        )}
        {semesters.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noModules")}</p>
        ) : (
          <SemesterModulesBoard
            programId={programId}
            semesters={boardSemesters}
            gradeLabel={gradeLabel}
            preparedness={preparedness}
            labels={{
              examType: tStudies("module.examType"),
              ects: tStudies("stats.ects"),
              grade: t("columnGrade"),
              prep: t("columnPreparedness"),
              noModules: t("noModules"),
              toPlan: t("toPlan"),
              currentSemester: t("currentSemester"),
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
