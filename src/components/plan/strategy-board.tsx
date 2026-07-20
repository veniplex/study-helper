"use client"

import * as React from "react"
import { AlertTriangle, CalendarClock, Loader2, RefreshCw } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { useRouter } from "@/i18n/navigation"
import { toggleSession } from "@/app/[locale]/(app)/plan/schedule-actions"
import type { ScheduleWarning } from "@/lib/plan/scheduler"
import { ModulePlanPrefs } from "@/components/plan/module-plan-prefs"
import { SetupChecklist, type SetupStep } from "@/components/plan/setup-checklist"
import { useRecompute } from "@/components/plan/use-recompute"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { enqueue, isNetworkError } from "@/lib/offline/outbox"
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
  setupSteps = [],
}: {
  semesterId: string
  hasAvailability: boolean
  modules: StrategyModule[]
  sessions: PreviewSession[]
  setupSteps?: SetupStep[]
}) {
  const t = useTranslations("plan")
  const { recompute, computing } = useRecompute(semesterId)
  const [warnings, setWarnings] = React.useState<ScheduleWarning[]>([])

  const nameById = React.useMemo(
    () => new Map(modules.map((m) => [m.moduleId, m.name])),
    [modules]
  )

  async function onCompute() {
    setWarnings(await recompute())
  }

  const showChecklist = sessions.length === 0 && setupSteps.some((s) => !s.done)

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("strategy.title")}</CardTitle>
        <Button size="sm" disabled={computing || !hasAvailability} onClick={() => void onCompute()}>
          {computing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t("strategy.compute")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showChecklist && (
          <SetupChecklist steps={setupSteps} storageKey={`strategy-${semesterId}`} />
        )}
        {!hasAvailability && (
          <p className="text-muted-foreground text-sm">{t("strategy.needAvailability")}</p>
        )}
        {modules.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-sm">{t("strategy.noModules")}</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m) => (
              <ModulePlanPrefs
                key={m.moduleId}
                moduleId={m.moduleId}
                moduleName={m.name}
                layout="row"
                value={{
                  active: m.active,
                  weight: m.weight,
                  weeklyHoursTarget: m.weeklyHoursTarget,
                  phase: m.phase,
                  preferredWeekdays: m.preferredWeekdays,
                }}
              />
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
                  {t(`warningText.${w.kind}`)}
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

function SessionPreview({ sessions }: { sessions: PreviewSession[] }) {
  const t = useTranslations("plan")
  const showError = useActionErrorToast()
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
      // Offline: queue for replay instead of failing, same as the dashboard card.
      if (isNetworkError(error)) {
        await enqueue("toggle-session", { sessionId: id, done })
        router.refresh()
        return
      }
      showError(error)
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
                  aria-label={t("preview.toggleSession", {
                    label: [s.moduleName, s.startTime].filter(Boolean).join(" · "),
                  })}
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
