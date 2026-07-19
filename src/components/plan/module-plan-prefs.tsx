"use client"

import * as React from "react"
import { BookOpen } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { useRouter } from "@/i18n/navigation"
import { updateModulePlanPrefs } from "@/app/[locale]/(app)/plan/plan-task-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export type ModulePlanPrefsValue = {
  active: boolean
  weight: number
  weeklyHoursTarget: number | null
  phase: number
  preferredWeekdays: number[] | null
}

// Monday-first display order; values are JS weekday numbers.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * D1: shared module-plan prefs (active / weight / weekly-hours / phase /
 * preferred weekdays). Standardised on SAVE-ON-CHANGE — every field persists
 * immediately via `updateModulePlanPrefs`. Rendered by both the strategy board
 * (`layout="row"`, per-module row) and the module plan tab (`layout="card"`).
 */
export function ModulePlanPrefs({
  moduleId,
  value,
  layout,
  moduleName,
}: {
  moduleId: string
  value: ModulePlanPrefsValue
  layout: "row" | "card"
  /** Shown as the row label in `layout="row"`. */
  moduleName?: string
}) {
  const t = useTranslations("plan")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [active, setActive] = React.useState(value.active)
  const [weight, setWeight] = React.useState(String(value.weight))
  const [hours, setHours] = React.useState(
    value.weeklyHoursTarget == null ? "" : String(value.weeklyHoursTarget)
  )
  const [phase, setPhase] = React.useState(value.phase)
  const [weekdays, setWeekdays] = React.useState<number[]>(value.preferredWeekdays ?? [])

  async function save(patch: Record<string, unknown>) {
    try {
      await updateModulePlanPrefs(moduleId, patch)
      router.refresh()
    } catch (error) {
      showError(error)
    }
  }

  const inputSize = layout === "row" ? "h-8" : "h-9"
  const dayBtnSize = layout === "row" ? "size-7" : "size-8"

  const activeControl = (
    <Switch
      checked={active}
      onCheckedChange={(on) => {
        setActive(on)
        void save({ active: on })
      }}
      aria-label={t("prefs.active")}
    />
  )

  const weightField = (
    <label className={cn("flex items-center gap-1.5", layout === "row" ? "text-xs" : "text-sm")}>
      <span className="text-muted-foreground" title={t("prefs.weightHint")}>
        {t("prefs.weight")}
      </span>
      <Input
        type="number"
        min={0}
        step={0.5}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => void save({ weight: Number(weight) || 1 })}
        title={t("prefs.weightHint")}
        className={cn(inputSize, "w-16")}
      />
    </label>
  )

  const hoursField = (
    <label className={cn("flex items-center gap-1.5", layout === "row" ? "text-xs" : "text-sm")}>
      <span className="text-muted-foreground">{t("prefs.weeklyHours")}</span>
      <Input
        type="number"
        min={0}
        step={0.5}
        placeholder="—"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        onBlur={() => void save({ weeklyHoursTarget: hours === "" ? null : Number(hours) })}
        className={cn(inputSize, "w-16")}
      />
    </label>
  )

  const phaseField = (
    <label className={cn("flex items-center gap-1.5", layout === "row" ? "text-xs" : "text-sm")}>
      <span className="text-muted-foreground">{t("prefs.phase")}</span>
      <select
        value={phase}
        onChange={(e) => {
          const v = Number(e.target.value)
          setPhase(v)
          void save({ phase: v })
        }}
        className={cn("border-input bg-background rounded-md border px-2 text-sm", inputSize)}
      >
        <option value={1}>{t("phases.1")}</option>
        <option value={2}>{t("phases.2")}</option>
        <option value={3}>{t("phases.3")}</option>
      </select>
    </label>
  )

  const weekdayRow = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{t("prefs.weekdays")}</span>
      {WEEKDAYS.map((d) => {
        const on = weekdays.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? weekdays.filter((x) => x !== d) : [...weekdays, d]
              setWeekdays(next)
              void save({ preferredWeekdays: next.length > 0 ? next : null })
            }}
            className={cn(
              "flex items-center justify-center rounded-md text-xs",
              dayBtnSize,
              on
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-muted border"
            )}
          >
            {t(`weekdaysShort.${d}`)}
          </button>
        )
      })}
    </div>
  )

  if (layout === "row") {
    return (
      <div className={cn("rounded-md border p-3", !active && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-3">
          {activeControl}
          <span className="flex items-center gap-1.5 font-medium">
            <BookOpen className="text-muted-foreground size-4" />
            {moduleName}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {weightField}
            {hoursField}
            {phaseField}
          </div>
        </div>
        <div className="mt-2">{weekdayRow}</div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("prefs.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {activeControl}
          <Label className="font-normal">{t("prefs.active")}</Label>
        </div>
        <div className="flex flex-wrap gap-4">
          {weightField}
          {hoursField}
          {phaseField}
        </div>
        <p className="text-muted-foreground text-xs">{t("prefs.weightHint")}</p>
        <div className="space-y-1.5">
          <Label>{t("prefs.weekdays")}</Label>
          {weekdayRow}
        </div>
      </CardContent>
    </Card>
  )
}
