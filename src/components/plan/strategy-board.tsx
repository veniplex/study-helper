"use client"

import * as React from "react"
import { AlertTriangle, BookOpen, CalendarClock, Loader2, Sparkles } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { updateModulePlanPrefs } from "@/app/[locale]/(app)/plan/plan-task-actions"
import { recomputeSchedule, toggleSession } from "@/app/[locale]/(app)/plan/schedule-actions"
import type { ScheduleWarning } from "@/lib/plan/scheduler"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export type StrategyModule = {
  moduleId: string
  name: string
  active: boolean
  weight: number
  weeklyHoursTarget: number | null
  phase: number
  preferredWeekdays: number[] | null
}

export type PreviewSession = {
  id: string
  date: string
  startTime: string
  durationMinutes: number
  done: boolean
  moduleName: string | null
  taskCount: number
}

// Monday-first display order; values are JS weekday numbers.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = (d.getDay() + 6) % 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - day + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7
    )
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`
}

export function StrategyBoard({
  semesterId,
  hasAvailability,
  modules,
  sessions,
}: {
  semesterId: string
  hasAvailability: boolean
  modules: StrategyModule[]
  sessions: PreviewSession[]
}) {
  const t = useTranslations("plan")
  const router = useRouter()
  const [computing, setComputing] = React.useState(false)
  const [warnings, setWarnings] = React.useState<ScheduleWarning[]>([])

  const nameById = React.useMemo(
    () => new Map(modules.map((m) => [m.moduleId, m.name])),
    [modules]
  )

  async function onCompute() {
    setComputing(true)
    try {
      const res = await recomputeSchedule(semesterId)
      setWarnings(res.warnings)
      toast.success(t("strategy.computed", { count: res.sessions ?? 0 }))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setComputing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("strategy.title")}</CardTitle>
        <Button size="sm" disabled={computing || !hasAvailability} onClick={() => void onCompute()}>
          {computing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("strategy.compute")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAvailability && (
          <p className="text-muted-foreground text-sm">{t("strategy.needAvailability")}</p>
        )}
        {modules.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-sm">{t("strategy.noModules")}</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m) => (
              <ModuleRow key={m.moduleId} module={m} />
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  {t(`strategy.warning.${w.kind}`)}
                  {w.moduleId && nameById.has(w.moduleId) && (
                    <span className="text-muted-foreground"> · {nameById.get(w.moduleId)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <SessionPreview sessions={sessions} />
      </CardContent>
    </Card>
  )
}

function ModuleRow({ module: m }: { module: StrategyModule }) {
  const t = useTranslations("plan")
  const router = useRouter()
  const [active, setActive] = React.useState(m.active)
  const [weight, setWeight] = React.useState(String(m.weight))
  const [hours, setHours] = React.useState(m.weeklyHoursTarget == null ? "" : String(m.weeklyHoursTarget))
  const [phase, setPhase] = React.useState(m.phase)
  const [weekdays, setWeekdays] = React.useState<number[]>(m.preferredWeekdays ?? [])

  async function save(patch: Record<string, unknown>) {
    try {
      await updateModulePlanPrefs(m.moduleId, patch)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className={cn("rounded-md border p-3", !active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          checked={active}
          onCheckedChange={(on) => {
            setActive(on)
            void save({ active: on })
          }}
          aria-label={t("prefs.active")}
        />
        <span className="flex items-center gap-1.5 font-medium">
          <BookOpen className="text-muted-foreground size-4" />
          {m.name}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("prefs.weight")}</span>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => void save({ weight: Number(weight) || 1 })}
              className="h-8 w-16"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("prefs.weeklyHours")}</span>
            <Input
              type="number"
              min={0}
              step={0.5}
              placeholder="—"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => void save({ weeklyHoursTarget: hours === "" ? null : Number(hours) })}
              className="h-8 w-16"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("prefs.phase")}</span>
            <select
              value={phase}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPhase(v)
                void save({ phase: v })
              }}
              className="border-input bg-background h-8 rounded-md border px-2 text-sm"
            >
              <option value={1}>{t("phases.1")}</option>
              <option value={2}>{t("phases.2")}</option>
              <option value={3}>{t("phases.3")}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
              className={
                on
                  ? "bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-medium"
                  : "hover:bg-muted flex size-7 items-center justify-center rounded-md border text-xs"
              }
            >
              {t(`weekdaysShort.${d}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SessionPreview({ sessions }: { sessions: PreviewSession[] }) {
  const t = useTranslations("plan")
  const format = useFormatter()
  const router = useRouter()

  const weeks = new Map<string, PreviewSession[]>()
  for (const s of sessions) {
    const key = isoWeekKey(s.date)
    weeks.set(key, [...(weeks.get(key) ?? []), s])
  }

  async function onToggle(id: string, done: boolean) {
    try {
      await toggleSession(id, done)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (sessions.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">{t("preview.empty")}</p>
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <p className="text-sm font-medium">{t("preview.title")}</p>
      {[...weeks.entries()].map(([week, weekSessions]) => (
        <div key={week} className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("preview.week", { week: week.split("-W")[1] })}
          </h3>
          <ul className="space-y-1.5">
            {weekSessions.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  s.done && "opacity-60"
                )}
              >
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(on) => void onToggle(s.id, Boolean(on))}
                />
                <span className={cn("font-medium", s.done && "line-through")}>
                  {s.moduleName ?? ""}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("preview.taskCount", { count: s.taskCount })}
                </span>
                <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                  <CalendarClock className="size-3" />
                  {format.dateTime(new Date(`${s.date}T${s.startTime}`), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {" · "}
                  {s.startTime} · {s.durationMinutes} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
