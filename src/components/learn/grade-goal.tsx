"use client"

import * as React from "react"
import { Target } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { updateGradeGoal } from "@/app/[locale]/(app)/studies/actions"
import { requiredGradeForGoal } from "@/lib/grades"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * "What do I need?" simulator: given the current ECTS-weighted average and the
 * remaining ECTS, shows the average grade required in the remaining modules to
 * hit a target final grade. German grading only (1.0 best … 4.0 pass).
 */
export function GradeGoal({
  programId,
  average,
  gradedEcts,
  targetEcts,
  initialGoal,
}: {
  programId: string
  /** Current ECTS-weighted average over graded modules; null = nothing graded. */
  average: number | null
  /** Sum of ECTS that already have a final grade. */
  gradedEcts: number
  targetEcts: number
  /** Persisted target grade for this program, e.g. "2.0"; null = never set. */
  initialGoal: string | null
}) {
  const t = useTranslations("dashboard.gradeGoal")
  const locale = useLocale()
  const [target, setTarget] = React.useState(initialGoal ?? "2.0")
  const saveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [])

  function onTargetChange(value: string) {
    setTarget(value)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      updateGradeGoal(programId, value || null).catch(() => {})
    }, 500)
  }

  const remainingEcts = targetEcts - gradedEcts
  const parsed = Number(target.replace(",", "."))
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 4

  const result = valid ? requiredGradeForGoal(parsed, average, gradedEcts, targetEcts) : null

  if (remainingEcts <= 0) return null

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      <Target className="size-3 shrink-0" />
      <Label htmlFor="grade-goal" className="font-normal">
        {t("label")}
      </Label>
      <Input
        id="grade-goal"
        value={target}
        onChange={(e) => onTargetChange(e.target.value)}
        inputMode="decimal"
        className="h-6 w-14 px-1.5 text-xs tabular-nums"
      />
      <span>
        {!valid
          ? t("invalid")
          : result?.kind === "needed"
            ? t("needed", {
                grade: result.grade.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }),
                ects: remainingEcts,
              })
            : result?.kind === "safe"
              ? t("safe")
              : result?.kind === "unreachable"
                ? t("unreachable")
                : null}
      </span>
    </div>
  )
}
