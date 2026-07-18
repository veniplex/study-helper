"use client"

import * as React from "react"
import {
  BookMarked,
  ClipboardList,
  FileText,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Presentation,
  Target,
  Trash2,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import {
  addAttempt,
  deleteAttempt,
  deleteGoal,
  updateAttempt,
} from "@/app/[locale]/(app)/studies/goal-actions"
import type {
  GoalGradingRole,
  GoalType,
  GradingSystem,
} from "@/db/schema/studies"
import { formatGrade } from "@/lib/grades"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { GoalDialog, type GoalData } from "@/components/studies/goal-dialog"
import { cn } from "@/lib/utils"

const GOAL_ICON: Record<GoalType, React.ComponentType<{ className?: string }>> = {
  exam: GraduationCap,
  assignments: ListChecks,
  term_paper: FileText,
  presentation: Presentation,
  oral_exam: Mic,
  project: FolderKanban,
  thesis: BookMarked,
  other: Target,
}

const ROLE_BADGE_VARIANT: Record<GoalGradingRole, "default" | "secondary" | "outline"> = {
  grade: "default",
  bonus: "secondary",
  practice: "outline",
}

export type AttemptDTO = {
  id: string
  attempt: number
  resultPercent: string | null
  date: string | null
  passed: boolean | null
  note: string | null
}

/** A single grade goal's result from its latest attempt (serializable). */
export type GoalResultDTO = {
  grade: number | null
  percent: number | null
  passed: boolean | null
  attempt: number | null
}

/** Module-level bonus progress (from getModuleFinalGrade → final.bonus). */
export type BonusProgressDTO = {
  percentPoints: number
  gradeSteps: number
  conditionMet: boolean
  avgPercent: number
  completedShare: number
  gradedCount: number
  completedCount: number
}

/** Assignment roll-up for an assignments goal. */
export type AssignmentStatsDTO = {
  open: number
  submitted: number
  graded: number
  nextDue: { title: string; dueDate: string } | null
}

export type GoalCardData = {
  goal: GoalData & { id: string }
  attempts: AttemptDTO[]
  goalResult: GoalResultDTO | null
  assignmentStats: AssignmentStatsDTO | null
}

/** Whole-day difference from today to a "YYYY-MM-DD" date (negative = past). */
function daysUntil(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = dueDate.split("-").map(Number)
  const due = new Date(y, m - 1, d)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function CountdownBadge({ dueDate }: { dueDate: string | null }) {
  const t = useTranslations("goalCard")
  if (!dueDate) return <Badge variant="outline">{t("countdown.none")}</Badge>
  const days = daysUntil(dueDate)
  const label =
    days === 0
      ? t("countdown.today")
      : days > 0
        ? t("countdown.inDays", { days })
        : t("countdown.overdue", { days: -days })
  const variant = days < 0 ? "destructive" : days <= 7 ? "default" : "secondary"
  return <Badge variant={variant}>{label}</Badge>
}

/** Common card frame: type icon, title, role badge, edit/delete affordances. */
function GoalCardShell({
  moduleId,
  data,
  right,
  children,
}: {
  moduleId: string
  data: GoalCardData
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = useTranslations("goals")
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const { goal } = data
  const Icon = GOAL_ICON[goal.type]

  async function onDelete() {
    if (!confirm(t("deleteConfirm"))) return
    setPending(true)
    try {
      await deleteGoal(goal.id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{goal.title || t(`types.${goal.type}`)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={ROLE_BADGE_VARIANT[goal.gradingRole]}>
                {t(`roles.${goal.gradingRole}`)}
              </Badge>
              {right}
            </div>
          </div>
        </div>
        <span className="inline-flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => void onDelete()}>
            <Trash2 className="text-destructive size-3.5" />
          </Button>
        </span>
      </CardHeader>
      {children && <CardContent className="space-y-4">{children}</CardContent>}

      {editing && (
        <GoalDialog
          key={goal.id}
          moduleId={moduleId}
          goal={goal}
          open
          onOpenChange={(o) => !o && setEditing(false)}
        />
      )}
    </Card>
  )
}

/** Readiness row for exam-like goals: due cards + last quiz score. */
function ReadinessRow({
  stats,
}: {
  stats: { dueCards: number; lastQuizScore: number | null }
}) {
  const t = useTranslations("goalCard")
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-md border px-3 py-2">
        <p className="text-muted-foreground text-xs">{t("dueCards")}</p>
        <p className="text-lg font-semibold tabular-nums">{stats.dueCards}</p>
      </div>
      <div className="rounded-md border px-3 py-2">
        <p className="text-muted-foreground text-xs">{t("lastScore")}</p>
        <p className="text-lg font-semibold tabular-nums">
          {stats.lastQuizScore != null ? `${stats.lastQuizScore}%` : t("noScore")}
        </p>
      </div>
    </div>
  )
}

/** Attempts table + add/edit/delete dialog + per-goal grade (grade goals). */
function GoalAttempts({
  goalId,
  maxAttempts,
  passFail,
  gradingSystem,
  attempts,
  goalResult,
}: {
  goalId: string
  maxAttempts: number
  passFail: boolean
  gradingSystem: GradingSystem
  attempts: AttemptDTO[]
  goalResult: GoalResultDTO | null
}) {
  const t = useTranslations("studies.assessment")
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
      else await addAttempt(goalId, payload)
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {t("attemptOf", { n: attempts.length, max: maxAttempts })}
        </span>
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
                        ? formatGrade(
                            goalResult?.attempt === a.attempt ? goalResult.grade : null,
                            gradingSystem
                          )
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
                  defaultValue={
                    editing?.resultPercent != null ? String(Number(editing.resultPercent)) : ""
                  }
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
    </div>
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

/** Small per-goal grade readout shown in the header of grade goals. */
function GradeChip({
  passFail,
  gradingSystem,
  goalResult,
}: {
  passFail: boolean
  gradingSystem: GradingSystem
  goalResult: GoalResultDTO | null
}) {
  const t = useTranslations("studies.assessment")
  const display = passFail
    ? goalResult?.passed == null
      ? "–"
      : goalResult.passed
        ? t("passYes")
        : t("passNo")
    : goalResult?.grade != null
      ? formatGrade(goalResult.grade, gradingSystem)
      : "–"
  return (
    <span className="text-sm font-semibold tabular-nums">
      {t("gradeLabel")}: {display}
    </span>
  )
}

export function GoalCard({
  moduleId,
  basePath,
  data,
  gradingSystem,
  stats,
  bonus,
}: {
  moduleId: string
  basePath: string
  data: GoalCardData
  gradingSystem: GradingSystem
  stats: { dueCards: number; lastQuizScore: number | null }
  bonus: BonusProgressDTO | null
}) {
  const t = useTranslations("goalCard")
  const tBonus = useTranslations("studies.bonus")
  const format = useFormatter()
  const { goal } = data
  const isGrade = goal.gradingRole === "grade"
  const showAttempts = isGrade

  // ---- exam / oral_exam ------------------------------------------------------
  if (goal.type === "exam" || goal.type === "oral_exam") {
    return (
      <GoalCardShell
        moduleId={moduleId}
        data={data}
        right={
          <>
            <CountdownBadge dueDate={goal.dueDate} />
            {isGrade && (
              <GradeChip
                passFail={goal.passFail}
                gradingSystem={gradingSystem}
                goalResult={data.goalResult}
              />
            )}
          </>
        }
      >
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium">{t("readiness")}</p>
          <ReadinessRow stats={stats} />
        </div>
        {showAttempts && (
          <GoalAttempts
            goalId={goal.id}
            maxAttempts={goal.maxAttempts}
            passFail={goal.passFail}
            gradingSystem={gradingSystem}
            attempts={data.attempts}
            goalResult={data.goalResult}
          />
        )}
      </GoalCardShell>
    )
  }

  // ---- assignments -----------------------------------------------------------
  if (goal.type === "assignments") {
    const s = data.assignmentStats
    const showBonus = goal.gradingRole === "bonus" && goal.config.bonus?.type !== "none" && bonus
    return (
      <GoalCardShell moduleId={moduleId} data={data}>
        <div className="grid grid-cols-3 gap-3">
          {(["open", "submitted", "graded"] as const).map((k) => (
            <div key={k} className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{t(`assignmentStatus.${k}`)}</p>
              <p className="text-lg font-semibold tabular-nums">{s ? s[k] : 0}</p>
            </div>
          ))}
        </div>
        {goal.config.expectedCount != null && (
          <p className="text-muted-foreground text-xs">
            {t("expectedCount", { count: goal.config.expectedCount })}
          </p>
        )}
        {s?.nextDue && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("nextDue")}: </span>
            <span className="font-medium">{s.nextDue.title}</span>{" "}
            <span className="text-muted-foreground">
              ({format.dateTime(new Date(s.nextDue.dueDate), { dateStyle: "medium" })})
            </span>
          </p>
        )}
        {showBonus && bonus && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{tBonus("title")}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  bonus.conditionMet
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {bonus.conditionMet ? tBonus("met") : tBonus("notMet")}
              </span>
            </div>
            <BonusBar
              label={tBonus("avg")}
              value={bonus.avgPercent}
              target={goal.config.bonus?.minAvgPercent ?? null}
              suffix=" %"
            />
            <BonusBar
              label={tBonus("share")}
              value={bonus.completedShare * 100}
              target={
                goal.config.bonus?.minCompletedShare != null
                  ? goal.config.bonus.minCompletedShare * 100
                  : null
              }
              suffix=" %"
            />
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`${basePath}/assignments`} />}
        >
          <ClipboardList className="size-4" />
          {t("toAssignments")}
        </Button>
      </GoalCardShell>
    )
  }

  // ---- term_paper / thesis ---------------------------------------------------
  if (goal.type === "term_paper" || goal.type === "thesis") {
    return (
      <GoalCardShell
        moduleId={moduleId}
        data={data}
        right={<CountdownBadge dueDate={goal.dueDate} />}
      >
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`${basePath}/paper`} />}
        >
          <FileText className="size-4" />
          {t("openWriteup")}
        </Button>
        {showAttempts && (
          <GoalAttempts
            goalId={goal.id}
            maxAttempts={goal.maxAttempts}
            passFail={goal.passFail}
            gradingSystem={gradingSystem}
            attempts={data.attempts}
            goalResult={data.goalResult}
          />
        )}
      </GoalCardShell>
    )
  }

  // ---- presentation ----------------------------------------------------------
  if (goal.type === "presentation") {
    const items = ["outline", "slides", "rehearse", "timing"] as const
    return (
      <GoalCardShell
        moduleId={moduleId}
        data={data}
        right={<CountdownBadge dueDate={goal.dueDate} />}
      >
        {goal.config.durationMinutes != null && (
          <p className="text-muted-foreground text-sm">
            {t("duration", { minutes: goal.config.durationMinutes })}
          </p>
        )}
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium">{t("checklist")}</p>
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it} className="flex items-center gap-2 text-sm">
                <span className="border-muted-foreground/40 size-4 shrink-0 rounded border" />
                {t(`checklistItems.${it}`)}
              </li>
            ))}
          </ul>
        </div>
      </GoalCardShell>
    )
  }

  // ---- project / other (minimal) --------------------------------------------
  return (
    <GoalCardShell
      moduleId={moduleId}
      data={data}
      right={<CountdownBadge dueDate={goal.dueDate} />}
    >
      {showAttempts && (
        <GoalAttempts
          goalId={goal.id}
          maxAttempts={goal.maxAttempts}
          passFail={goal.passFail}
          gradingSystem={gradingSystem}
          attempts={data.attempts}
          goalResult={data.goalResult}
        />
      )}
    </GoalCardShell>
  )
}
