"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createGoal, updateGoal } from "@/app/[locale]/(app)/studies/goal-actions"
import type {
  BonusType,
  GoalConfig,
  GoalGradingRole,
  GoalType,
} from "@/db/schema/studies"

export type GoalData = {
  id?: string
  type: GoalType
  title: string | null
  gradingRole: GoalGradingRole
  /** numeric column, carried as string. */
  weight: string
  maxAttempts: number
  passFail: boolean
  dueDate: string | null
  config: GoalConfig
}

const GOAL_TYPES: GoalType[] = [
  "exam",
  "assignments",
  "term_paper",
  "presentation",
  "oral_exam",
  "project",
  "thesis",
  "other",
]
const GRADING_ROLES: GoalGradingRole[] = ["grade", "bonus", "practice"]
const BONUS_TYPES: BonusType[] = ["none", "percent_points", "grade_steps"]

/** Types that carry a single deadline/date field (assignments use per-hand-in dates). */
const HAS_DUE_DATE: GoalType[] = [
  "exam",
  "oral_exam",
  "term_paper",
  "presentation",
  "thesis",
  "project",
  "other",
]

/**
 * Create/edit dialog for a module learning goal. Type-specific fields toggle
 * on the selected `type` / `gradingRole`. Controlled via `open`/`onOpenChange`
 * (the goals card owns a single instance) or self-managed via `trigger`.
 *
 * Reset on reopen is handled by the caller keying the element by goal id/type.
 */
export function GoalDialog({
  moduleId,
  goal,
  defaultType = "exam",
  open,
  onOpenChange,
  trigger,
}: {
  moduleId: string
  goal?: GoalData
  defaultType?: GoalType
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}) {
  const t = useTranslations("goals")
  const router = useRouter()
  const isEdit = Boolean(goal?.id)

  const [type, setType] = React.useState<GoalType>(goal?.type ?? defaultType)
  const [gradingRole, setGradingRole] = React.useState<GoalGradingRole>(
    goal?.gradingRole ?? "grade"
  )
  const [passFail, setPassFail] = React.useState(goal?.passFail ?? false)
  const [variant, setVariant] = React.useState<"scientific" | "task">(
    goal?.config.variant ?? "scientific"
  )
  const [requiresSources, setRequiresSources] = React.useState(
    goal?.config.requiresSources ?? false
  )
  const [withPresentation, setWithPresentation] = React.useState(
    goal?.config.withPresentation ?? false
  )
  const [bonusType, setBonusType] = React.useState<BonusType>(
    goal?.config.bonus?.type ?? "percent_points"
  )

  const cfg = goal?.config ?? {}

  async function onSubmit(form: FormData) {
    const num = (key: string) => {
      const v = form.get(key)
      return v != null && String(v).trim() !== "" ? Number(v) : undefined
    }
    const str = (key: string) => String(form.get(key) ?? "").trim() || undefined

    const config: GoalConfig = {}
    if (type === "assignments") {
      const ec = num("expectedCount")
      if (ec != null) config.expectedCount = ec
      if (gradingRole === "bonus") {
        config.bonus = {
          type: bonusType,
          value: num("bonusValue"),
          minAvgPercent: num("bonusMinAvg"),
          minCompletedShare: num("bonusMinShare"),
        }
      }
    }
    if (type === "term_paper") {
      config.variant = variant
      const td = str("taskDescription")
      if (td) config.taskDescription = td
      config.requiresSources = requiresSources
      config.withPresentation = withPresentation
    }
    if (type === "presentation") {
      const dm = num("durationMinutes")
      if (dm != null) config.durationMinutes = dm
    }

    const payload = {
      type,
      title: str("title") ?? null,
      gradingRole,
      weight: num("weight") ?? 1,
      maxAttempts: num("maxAttempts") ?? 3,
      passFail,
      dueDate: (form.get("dueDate") && String(form.get("dueDate"))) || null,
      config,
    }

    if (isEdit) await updateGoal(goal!.id!, payload)
    else await createGoal(moduleId, payload)
    router.refresh()
  }

  const showDueDate = HAS_DUE_DATE.includes(type)
  const isExamLike = type === "exam" || type === "oral_exam"

  return (
    <FormDialog
      title={isEdit ? t("edit") : t("add")}
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      onSubmit={onSubmit}
    >
      <div className="space-y-1.5">
        <Label>{t("type")}</Label>
        <Select value={type} onValueChange={(v) => setType(v as GoalType)}>
          <SelectTrigger className="w-full">
            <SelectValue>{t(`types.${type}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GOAL_TYPES.map((gt) => (
              <SelectItem key={gt} value={gt}>
                {t(`types.${gt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="g-title">{t("titleField")}</Label>
        <Input
          id="g-title"
          name="title"
          defaultValue={goal?.title ?? ""}
          placeholder={t(`typePlaceholder.${type}`)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("gradingRole")}</Label>
        <Select
          value={gradingRole}
          onValueChange={(v) => setGradingRole(v as GoalGradingRole)}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{t(`roles.${gradingRole}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GRADING_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {gradingRole === "grade" && (
        <div className="space-y-1.5">
          <Label htmlFor="g-weight">{t("weight")}</Label>
          <Input
            id="g-weight"
            name="weight"
            type="number"
            step="0.5"
            min={0}
            defaultValue={goal ? String(Number(goal.weight)) : "1"}
          />
        </div>
      )}

      {showDueDate && (
        <div className="space-y-1.5">
          <Label htmlFor="g-due">{t("dueDate")}</Label>
          <Input id="g-due" name="dueDate" type="date" defaultValue={goal?.dueDate ?? ""} />
        </div>
      )}

      {isExamLike && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="g-attempts">{t("maxAttempts")}</Label>
            <Input
              id="g-attempts"
              name="maxAttempts"
              type="number"
              min={1}
              max={20}
              defaultValue={goal?.maxAttempts ?? 3}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch checked={passFail} onCheckedChange={setPassFail} />
            {t("passFail")}
          </label>
        </div>
      )}

      {type === "assignments" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-count">{t("expectedCount")}</Label>
            <Input
              id="g-count"
              name="expectedCount"
              type="number"
              min={0}
              defaultValue={cfg.expectedCount ?? ""}
            />
          </div>
          {gradingRole === "bonus" && (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label>{t("bonus.type")}</Label>
                <Select
                  value={bonusType}
                  onValueChange={(v) => setBonusType(v as BonusType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{t(`bonus.types.${bonusType}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BONUS_TYPES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {t(`bonus.types.${b}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bonusType !== "none" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="g-bvalue">{t("bonus.value")}</Label>
                    <Input
                      id="g-bvalue"
                      name="bonusValue"
                      type="number"
                      step="0.1"
                      min={0}
                      defaultValue={cfg.bonus?.value ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-bavg">{t("bonus.minAvgPercent")}</Label>
                    <Input
                      id="g-bavg"
                      name="bonusMinAvg"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={cfg.bonus?.minAvgPercent ?? ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-bshare">{t("bonus.minCompletedShare")}</Label>
                    <Input
                      id="g-bshare"
                      name="bonusMinShare"
                      type="number"
                      step="0.1"
                      min={0}
                      max={1}
                      defaultValue={cfg.bonus?.minCompletedShare ?? ""}
                    />
                    <p className="text-muted-foreground text-xs">{t("bonus.minCompletedShareHint")}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {type === "term_paper" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("variant.label")}</Label>
            <Select
              value={variant}
              onValueChange={(v) => setVariant(v as "scientific" | "task")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{t(`variant.${variant}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scientific">{t("variant.scientific")}</SelectItem>
                <SelectItem value="task">{t("variant.task")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-task">{t("taskDescription")}</Label>
            <Textarea
              id="g-task"
              name="taskDescription"
              rows={3}
              defaultValue={cfg.taskDescription ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={requiresSources} onCheckedChange={setRequiresSources} />
            {t("requiresSources")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={withPresentation} onCheckedChange={setWithPresentation} />
            {t("withPresentation")}
          </label>
        </div>
      )}

      {type === "presentation" && (
        <div className="space-y-1.5">
          <Label htmlFor="g-duration">{t("durationMinutes")}</Label>
          <Input
            id="g-duration"
            name="durationMinutes"
            type="number"
            min={0}
            defaultValue={cfg.durationMinutes ?? ""}
          />
        </div>
      )}
    </FormDialog>
  )
}
