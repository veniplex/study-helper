"use client"

import { useTranslations } from "next-intl"
import type { GradingSystem } from "@/db/schema/studies"
import { formatGrade } from "@/lib/grades"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type FinalGradeDTO = {
  grade: number | null
  percent: number | null
  passed: boolean | null
  attempt: number | null
  source: "assessment" | "legacy" | null
  bonus: {
    percentPoints: number
    gradeSteps: number
    conditionMet: boolean
    avgPercent: number
    completedShare: number
    gradedCount: number
    completedCount: number
  } | null
}

export type LegacyGradeDTO = {
  id: string
  value: string
  weight: string
  attempt: number
  gradedAt: string | null
  note: string | null
}

/**
 * Compact module-level grade summary: the final grade (weighted across all
 * grade goals), an aggregate bonus badge and access to legacy free-form grades.
 * Per-goal attempts live on the individual goal cards.
 */
export function ModuleGradeSummaryCard({
  gradingSystem,
  final,
  legacyGrades,
  hasBonusGoal,
}: {
  gradingSystem: GradingSystem
  final: FinalGradeDTO
  legacyGrades: LegacyGradeDTO[]
  hasBonusGoal: boolean
}) {
  const t = useTranslations("studies.assessment")
  const tBonus = useTranslations("studies.bonus")

  const gradeDisplay =
    final.grade != null
      ? formatGrade(final.grade, gradingSystem)
      : final.passed == null
        ? "–"
        : final.passed
          ? t("passYes")
          : t("passNo")

  const showLegacy = legacyGrades.length > 0
  const showBonus = hasBonusGoal && final.bonus != null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle>{t("title")}</CardTitle>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">{t("gradeLabel")}</p>
          <p className="text-2xl font-semibold tabular-nums">{gradeDisplay}</p>
          {final.grade != null && final.percent != null && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {Math.round(final.percent)} %
            </p>
          )}
        </div>
      </CardHeader>
      {(showBonus || showLegacy) && (
        <CardContent className="space-y-3">
          {showBonus && final.bonus && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">{tBonus("title")}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  final.bonus.conditionMet
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {final.bonus.conditionMet ? tBonus("met") : tBonus("notMet")}
              </span>
            </div>
          )}
          {showLegacy && (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="text-muted-foreground cursor-pointer font-medium">
                {t("legacy")}
              </summary>
              <ul className="mt-2 space-y-1">
                {legacyGrades.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 tabular-nums">
                    <span className="font-medium">
                      {formatGrade(Number(g.value), gradingSystem)}
                    </span>
                    <span className="text-muted-foreground text-xs">×{Number(g.weight)}</span>
                    {g.note && <span className="text-muted-foreground text-xs">{g.note}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      )}
    </Card>
  )
}
