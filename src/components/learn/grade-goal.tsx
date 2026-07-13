"use client"

import * as React from "react"
import { Target } from "lucide-react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * "What do I need?" simulator: given the current ECTS-weighted average and the
 * remaining ECTS, shows the average grade required in the remaining modules to
 * hit a target final grade. German grading only (1.0 best … 4.0 pass).
 */
function storageKey(programId: string) {
  return `study-helper:grade-goal:${programId}`
}

export function GradeGoal({
  programId,
  average,
  gradedEcts,
  targetEcts,
}: {
  programId: string
  /** Current ECTS-weighted average over graded modules; null = nothing graded. */
  average: number | null
  /** Sum of ECTS that already have a final grade. */
  gradedEcts: number
  targetEcts: number
}) {
  const t = useTranslations("dashboard.gradeGoal")
  const [target, setTarget] = React.useState("2.0")

  // Load persisted target after mount (avoids SSR hydration mismatch).
  React.useEffect(() => {
    const stored = window.localStorage.getItem(storageKey(programId))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setTarget(stored)
  }, [programId])

  React.useEffect(() => {
    window.localStorage.setItem(storageKey(programId), target)
  }, [programId, target])

  const remainingEcts = targetEcts - gradedEcts
  const parsed = Number(target.replace(",", "."))
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 4

  let result: { kind: "needed"; value: number } | { kind: "safe" } | { kind: "unreachable" } | null =
    null
  if (valid && remainingEcts > 0) {
    const required =
      ((parsed * targetEcts - (average ?? 0) * gradedEcts) / remainingEcts) || 0
    if (required < 1) result = { kind: "unreachable" }
    else if (required >= 4) result = { kind: "safe" }
    else result = { kind: "needed", value: required }
  }

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
        onChange={(e) => setTarget(e.target.value)}
        inputMode="decimal"
        className="h-6 w-14 px-1.5 text-xs tabular-nums"
      />
      <span>
        {!valid
          ? t("invalid")
          : result?.kind === "needed"
            ? t("needed", {
                grade: result.value.toLocaleString("de-DE", {
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
