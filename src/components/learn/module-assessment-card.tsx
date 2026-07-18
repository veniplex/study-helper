"use client"

import * as React from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  addAttempt,
  deleteAttempt,
  updateAttempt,
} from "@/app/[locale]/(app)/studies/goal-actions"
import type { BonusType, GoalType, GradingSystem } from "@/db/schema/studies"
import { formatGrade } from "@/lib/grades"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

/** Maps a goal type to the (existing) assessment-type i18n label key. */
const GOAL_LABEL_KEY: Record<GoalType, string> = {
  exam: "assessmentExam",
  assignments: "assessmentOther",
  term_paper: "assessmentTermPaper",
  presentation: "assessmentOralPresentation",
  oral_exam: "assessmentOralExam",
  project: "assessmentProject",
  thesis: "assessmentTermPaper",
  other: "assessmentOther",
}

export type AttemptDTO = {
  id: string
  attempt: number
  resultPercent: string | null
  date: string | null
  passed: boolean | null
  note: string | null
}

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

export function ModuleAssessmentCard({
  moduleId,
  assessmentType,
  maxAttempts,
  passFail,
  gradingSystem,
  attempts,
  final,
  legacyGrades,
  bonusType,
  bonusValue,
  bonusMinAvgPercent,
  bonusMinCompletedShare,
}: {
  moduleId: string
  assessmentType: GoalType
  maxAttempts: number
  passFail: boolean
  gradingSystem: GradingSystem
  attempts: AttemptDTO[]
  final: FinalGradeDTO
  legacyGrades: LegacyGradeDTO[]
  bonusType: BonusType
  bonusValue: string | null
  bonusMinAvgPercent: string | null
  bonusMinCompletedShare: string | null
}) {
  const t = useTranslations("studies.assessment")
  const tDialog = useTranslations("studies.moduleDialog")
  const tBonus = useTranslations("studies.bonus")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AttemptDTO | null>(null)
  const [passed, setPassed] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const atMax = attempts.length >= maxAttempts

  function openNew() {
    setEditing(null)
    setPassed(false)
    setOpen(true)
  }
  function openEdit(a: AttemptDTO) {
    setEditing(a)
    setPassed(a.passed ?? false)
    setOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      resultPercent:
        form.get("resultPercent") && String(form.get("resultPercent")).trim() !== ""
          ? Number(form.get("resultPercent"))
          : null,
      date: String(form.get("date") || "") || null,
      passed,
      note: String(form.get("note") || "") || null,
    }
    setPending(true)
    try {
      if (editing) await updateAttempt(editing.id, payload)
      else await addAttempt(moduleId, payload)
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteAttempt(id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const gradeDisplay = passFail
    ? final.passed == null
      ? "–"
      : final.passed
        ? t("passYes")
        : t("passNo")
    : final.grade != null
      ? formatGrade(final.grade, gradingSystem)
      : "–"

  const showLegacy = legacyGrades.length > 0 && attempts.length === 0
  const showBonus = bonusType !== "none" && final.bonus != null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-0.5">
          <CardTitle>{t("title")}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {tDialog(GOAL_LABEL_KEY[assessmentType])} ·{" "}
            {t("attemptOf", { n: attempts.length, max: maxAttempts })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">{t("gradeLabel")}</p>
          <p className="text-2xl font-semibold tabular-nums">{gradeDisplay}</p>
          {!passFail && final.percent != null && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {Math.round(final.percent)} %
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={openNew} disabled={atMax}>
            <Plus className="size-4" />
            {t("addAttempt")}
          </Button>
        </div>

        {attempts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noAttempts")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">{t("attemptCol")}</th>
                  <th className="py-2 pr-4 font-medium">{t("percentCol")}</th>
                  <th className="py-2 pr-4 font-medium">{t("dateCol")}</th>
                  {!passFail && <th className="py-2 pr-4 font-medium">{t("gradeCol")}</th>}
                  <th className="py-2 pr-4 font-medium">{t("passedCol")}</th>
                  <th className="py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium tabular-nums">{a.attempt}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {a.resultPercent != null ? `${Number(a.resultPercent)} %` : "–"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {a.date ? format.dateTime(new Date(a.date), { dateStyle: "medium" }) : "–"}
                    </td>
                    {!passFail && (
                      <td className="py-2.5 pr-4 tabular-nums">
                        {a.resultPercent != null
                          ? formatGrade(final.attempt === a.attempt ? final.grade : null, gradingSystem)
                          : "–"}
                      </td>
                    )}
                    <td className="py-2.5 pr-4">
                      {a.passed == null
                        ? t("passUnknown")
                        : a.passed
                          ? t("passYes")
                          : t("passNo")}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(a.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showBonus && final.bonus && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
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
            <p className="text-muted-foreground text-xs">
              {bonusType === "percent_points"
                ? tBonus("rulePercent", { value: Number(bonusValue ?? 0) })
                : tBonus("ruleSteps", { value: Number(bonusValue ?? 0) })}
            </p>
            <BonusBar
              label={tBonus("avg")}
              value={final.bonus.avgPercent}
              target={bonusMinAvgPercent != null ? Number(bonusMinAvgPercent) : null}
              suffix=" %"
            />
            <BonusBar
              label={tBonus("share")}
              value={final.bonus.completedShare * 100}
              target={
                bonusMinCompletedShare != null ? Number(bonusMinCompletedShare) * 100 : null
              }
              suffix=" %"
            />
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
                  <span className="font-medium">{formatGrade(Number(g.value), gradingSystem)}</span>
                  <span className="text-muted-foreground text-xs">×{Number(g.weight)}</span>
                  {g.note && <span className="text-muted-foreground text-xs">{g.note}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editAttempt") : t("addAttempt")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="at-percent">{t("percentField")}</Label>
                <Input
                  id="at-percent"
                  name="resultPercent"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  defaultValue={editing?.resultPercent != null ? String(Number(editing.resultPercent)) : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="at-date">{t("dateField")}</Label>
                <Input id="at-date" name="date" type="date" defaultValue={editing?.date ?? ""} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={passed} onCheckedChange={setPassed} />
              {t("passedField")}
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="at-note">{t("noteField")}</Label>
              <Input id="at-note" name="note" defaultValue={editing?.note ?? ""} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {tCommon("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function BonusBar({
  label,
  value,
  target,
  suffix,
}: {
  label: string
  value: number
  target: number | null
  suffix: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const met = target == null || value >= target
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {Math.round(value)}
          {suffix}
          {target != null && ` / ${Math.round(target)}${suffix}`}
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", met ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
