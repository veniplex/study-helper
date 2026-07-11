import * as React from "react"
import { ArrowRight, GraduationCap, Settings } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import type { FinalGrade } from "@/lib/grades"
import { formatGrade, programAverageFromFinals } from "@/lib/grades"
import type { GradingSystem } from "@/db/schema/studies"
import type { SemesterModule } from "@/lib/studies/context"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import {
  deleteModule,
  deleteSemester,
} from "@/app/[locale]/(app)/studies/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { ModuleStatusBadge } from "@/components/learn/module-status-badge"
import { MoveModuleButtons } from "@/components/learn/move-module-buttons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

type SemesterRow = {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  modules: SemesterModule[]
}

function ModuleGlyph({ iconKey, className }: { iconKey: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
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
  const tNav = await getTranslations("nav")
  const format = await getFormatter()

  const allModules = semesters.flatMap((s) => s.modules)
  const earnedEcts = allModules
    .filter((m) => m.status === "passed")
    .reduce((sum, m) => sum + (m.ects ?? 0), 0)
  const average = programAverageFromFinals(
    allModules.map((m) => ({ finalGrade: finalGrades.get(m.id)?.grade ?? null, ects: m.ects }))
  )

  const stats: { label: string; value: string }[] = [
    {
      label: tStudies("stats.ects"),
      value: `${earnedEcts}${targetEcts ? ` / ${targetEcts}` : ""}`,
    },
    { label: tStudies("stats.average"), value: average != null ? formatGrade(average, gradingSystem) : "–" },
    { label: tStudies("stats.modules"), value: String(allModules.length) },
    { label: tStudies("stats.semesters"), value: String(semesters.length) },
  ]

  function gradeCell(m: SemesterModule): string {
    const final = finalGrades.get(m.id)
    if (!final) return "–"
    if (m.passFail) return final.passed == null ? "–" : final.passed ? "✓" : "✗"
    return final.grade != null ? formatGrade(final.grade, gradingSystem) : "–"
  }

  function dateRange(s: SemesterRow): string | null {
    if (!s.startDate && !s.endDate) return null
    const fmt = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" })
    if (s.startDate && s.endDate) return `${fmt(s.startDate)} – ${fmt(s.endDate)}`
    return fmt((s.startDate ?? s.endDate)!)
  }

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
            href="/thesis"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <GraduationCap className="size-3.5" />
            {tNav("thesis")}
          </Link>
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
        {semesters.length === 0 && (
          <p className="text-muted-foreground text-sm">{t("noModules")}</p>
        )}
        {semesters.map((sem) => {
          const orderedIds = sem.modules.map((m) => m.id)
          return (
            <div key={sem.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 border-b pb-1.5">
                <span className="font-medium">{sem.name}</span>
                {sem.id === currentSemesterId && (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                    {t("currentSemester")}
                  </span>
                )}
                {dateRange(sem) && (
                  <span className="text-muted-foreground text-xs">{dateRange(sem)}</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <Link
                    href={`/plan/${sem.id}`}
                    className="text-muted-foreground hover:text-foreground mr-1 flex items-center gap-1 text-xs"
                  >
                    {t("toPlan")}
                    <ArrowRight className="size-3" />
                  </Link>
                  <ModuleDialog semesterId={sem.id} />
                  <SemesterDialog
                    programId={programId}
                    semester={{
                      id: sem.id,
                      name: sem.name,
                      startDate: sem.startDate,
                      endDate: sem.endDate,
                    }}
                  />
                  <DeleteButton action={deleteSemester.bind(null, sem.id)} />
                </span>
              </div>
              {sem.modules.length === 0 ? (
                <p className="text-muted-foreground py-1 text-sm">{t("noModules")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[42rem] grid-cols-[auto_1.6fr_7rem_6rem_3rem_3rem_8rem_auto] items-center gap-x-3 gap-y-2 text-sm">
                    <span />
                    <span />
                    <span />
                    <span className="text-muted-foreground text-xs font-medium">
                      {tStudies("module.examType")}
                    </span>
                    <span className="text-muted-foreground text-right text-xs font-medium">
                      {tStudies("stats.ects")}
                    </span>
                    <span className="text-muted-foreground text-right text-xs font-medium">
                      {t("columnGrade")}
                    </span>
                    <span className="text-muted-foreground text-xs font-medium">
                      {t("columnPreparedness")}
                    </span>
                    <span />
                    {sem.modules.map((m, i) => {
                      const color = getModuleColorClasses(m.color)
                      const prep = m.status === "active" ? preparedness.get(m.id) ?? null : null
                      return (
                        <React.Fragment key={m.id}>
                          <MoveModuleButtons
                            semesterId={sem.id}
                            orderedIds={orderedIds}
                            index={i}
                          />
                          <Link
                            href={`/studies/${programId}/${m.id}`}
                            className="flex min-w-0 items-center gap-2 font-medium underline-offset-4 hover:underline"
                          >
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded",
                                color.soft,
                                color.text
                              )}
                            >
                              <ModuleGlyph iconKey={m.icon} className="size-3.5" />
                            </span>
                            <span className="truncate">{m.name}</span>
                          </Link>
                          <ModuleStatusBadge status={m.status} className="justify-self-start" />
                          <span className="text-muted-foreground truncate text-xs">
                            {m.examType ?? "–"}
                          </span>
                          <span className="text-muted-foreground text-right text-xs tabular-nums">
                            {m.ects ?? "–"}
                          </span>
                          <span className="text-right text-xs tabular-nums">{gradeCell(m)}</span>
                          {m.status === "active" ? (
                            <span className="flex items-center gap-2">
                              <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                                {prep != null && (
                                  <span
                                    className="bg-primary block h-full rounded-full"
                                    style={{ width: `${prep}%` }}
                                  />
                                )}
                              </span>
                              <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
                                {prep != null ? `${prep}%` : "–"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">–</span>
                          )}
                          <span className="flex items-center justify-end gap-0.5">
                            <ModuleDialog semesterId={sem.id} module={m} />
                            <DeleteButton action={deleteModule.bind(null, m.id)} />
                          </span>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
