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
export function GradeGoal({
  average,
  gradedEcts,
  targetEcts,
}: {
  /** Current ECTS-weighted average over graded modules; null = nothing graded. */
  average: number | null
  /** Sum of ECTS that already have a final grade. */
  gradedEcts: number
  targetEcts: number
}) {
  const t = useTranslations("dashboard.gradeGoal")
  const [target, setTarget] = React.useState("2.0")

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
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-md border border-dashed px-3 py-2">
      <div className="space-y-1">
        <Label htmlFor="grade-goal" className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
          <Target className="size-3" />
          {t("label")}
        </Label>
        <Input
          id="grade-goal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="decimal"
          className="h-7 w-20 text-sm tabular-nums"
        />
      </div>
      <p className="text-sm leading-7">
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
      </p>
    </div>
  )
}
