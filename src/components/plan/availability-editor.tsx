"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActionErrorToast } from "@/components/action-error-toast"
import { useRouter } from "@/i18n/navigation"
import { saveAvailability, saveWeekOverride } from "@/app/[locale]/(app)/plan/actions"
import type { PlanAvailability, WeekOverrides } from "@/db/schema"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

// Monday-first display order; values are JS weekday numbers
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

type WeeklyRow = { enabled: boolean; from: string; to: string }

export function AvailabilityEditor({
  semesterId,
  initial,
  weekOverrides,
}: {
  semesterId: string
  initial: PlanAvailability | null
  weekOverrides?: WeekOverrides | null
}) {
  const t = useTranslations("semesterPlan")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [pending, setPending] = React.useState<"save" | null>(null)
  const [weekly, setWeekly] = React.useState<Record<number, WeeklyRow>>(() => {
    const base: Record<number, WeeklyRow> = {}
    for (const d of WEEKDAYS) base[d] = { enabled: false, from: "18:00", to: "20:00" }
    for (const w of initial?.weekly ?? []) {
      base[w.weekday] = { enabled: true, from: w.from, to: w.to }
    }
    return base
  })
  const [blackouts, setBlackouts] = React.useState(initial?.blackouts ?? [])
  const [recurring, setRecurring] = React.useState(initial?.recurring ?? [])

  function payload(): PlanAvailability {
    return {
      // weekly is seeded with an entry for every WEEKDAYS value in useState, so
      // indexing by a WEEKDAYS member always hits.
      weekly: WEEKDAYS.filter((d) => weekly[d]!.enabled).map((d) => ({
        weekday: d,
        from: weekly[d]!.from,
        to: weekly[d]!.to,
      })),
      blackouts: blackouts.filter((b) => b.from && b.to),
      recurring: recurring.filter((r) => r.from && r.to),
    }
  }

  async function onSave() {
    setPending("save")
    try {
      await saveAvailability(semesterId, payload())
      toast.success(t("saved"))
      router.refresh()
    } catch (error) {
      showError(error)
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("availability")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <Switch
                id={`wd-${d}`}
                checked={weekly[d]!.enabled}
                onCheckedChange={(on) =>
                  // every WEEKDAYS key exists in state (seeded in useState)
                  setWeekly((w) => ({ ...w, [d]: { ...w[d]!, enabled: on } }))
                }
              />
              <Label htmlFor={`wd-${d}`} className="w-24 font-normal">
                {t(`weekdays.${d}`)}
              </Label>
              {weekly[d]!.enabled && (
                <>
                  <Input
                    type="time"
                    value={weekly[d]!.from}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, [d]: { ...w[d]!, from: e.target.value } }))
                    }
                    className="h-8 w-28"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={weekly[d]!.to}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, [d]: { ...w[d]!, to: e.target.value } }))
                    }
                    className="h-8 w-28"
                  />
                </>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("blackouts")}</p>
          {blackouts.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                type="date"
                value={b.from}
                onChange={(e) =>
                  setBlackouts((list) =>
                    list.map((x, j) => (j === i ? { ...x, from: e.target.value } : x))
                  )
                }
                className="h-8 w-36"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={b.to}
                onChange={(e) =>
                  setBlackouts((list) =>
                    list.map((x, j) => (j === i ? { ...x, to: e.target.value } : x))
                  )
                }
                className="h-8 w-36"
              />
              <Input
                placeholder={t("blackoutLabel")}
                value={b.label ?? ""}
                onChange={(e) =>
                  setBlackouts((list) =>
                    list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                  )
                }
                className="h-8 w-40"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setBlackouts((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">{t("removeBlackout")}</span>
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBlackouts((list) => [...list, { from: "", to: "", label: "" }])}
          >
            <Plus className="size-3.5" />
            {t("addBlackout")}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("recurring")}</p>
          {recurring.map((r, i) =>
            r.cron != null ? (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <Input
                  value={r.cron}
                  onChange={(e) =>
                    setRecurring((list) =>
                      list.map((x, j) => (j === i ? { ...x, cron: e.target.value } : x))
                    )
                  }
                  placeholder="0 18 * * 2"
                  className="h-8 w-36 font-mono"
                  title={t("cronHint")}
                />
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={r.durationMinutes ?? 60}
                  onChange={(e) =>
                    setRecurring((list) =>
                      list.map((x, j) =>
                        j === i
                          ? { ...x, durationMinutes: Math.max(5, Number(e.target.value) || 60) }
                          : x
                      )
                    )
                  }
                  className="h-8 w-20"
                  title={t("cronDuration")}
                />
                <span className="text-muted-foreground text-xs">{t("cronDuration")}</span>
                <Input
                  placeholder={t("blackoutLabel")}
                  value={r.label ?? ""}
                  onChange={(e) =>
                    setRecurring((list) =>
                      list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                    )
                  }
                  className="h-8 w-36"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRecurring((list) =>
                      list.map((x, j) =>
                        j === i ? { ...x, cron: undefined, durationMinutes: undefined } : x
                      )
                    )
                  }
                >
                  {t("simpleMode")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setRecurring((list) => list.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{t("removeBlackout")}</span>
                </Button>
              </div>
            ) : (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex gap-1" role="group" aria-label={t("recurringWeekday")}>
                {WEEKDAYS.map((d) => {
                  const active = (r.weekdays?.length ? r.weekdays : [r.weekday]).includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setRecurring((list) =>
                          list.map((x, j) => {
                            if (j !== i) return x
                            const current = x.weekdays?.length ? x.weekdays : [x.weekday]
                            const next = active
                              ? current.filter((wd) => wd !== d)
                              : [...current, d]
                            // keep at least one day selected
                            const days = next.length > 0 ? next : current
                            // days is either `next` (length checked) or the
                            // non-empty `current`, so index 0 always exists
                            return { ...x, weekday: days[0]!, weekdays: days }
                          })
                        )
                      }
                      className={
                        active
                          ? "bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-xs font-medium"
                          : "hover:bg-muted flex size-8 items-center justify-center rounded-md border text-xs"
                      }
                    >
                      {t(`weekdaysShort.${d}`)}
                    </button>
                  )
                })}
              </div>
              <Input
                type="time"
                value={r.from}
                onChange={(e) =>
                  setRecurring((list) =>
                    list.map((x, j) => (j === i ? { ...x, from: e.target.value } : x))
                  )
                }
                className="h-8 w-28"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={r.to}
                onChange={(e) =>
                  setRecurring((list) =>
                    list.map((x, j) => (j === i ? { ...x, to: e.target.value } : x))
                  )
                }
                className="h-8 w-28"
              />
              <select
                value={r.interval}
                onChange={(e) =>
                  setRecurring((list) =>
                    list.map((x, j) =>
                      j === i ? { ...x, interval: Number(e.target.value) as 1 | 2 } : x
                    )
                  )
                }
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                aria-label={t("recurringInterval")}
              >
                <option value={1}>{t("everyWeek")}</option>
                <option value={2}>{t("everySecondWeek")}</option>
              </select>
              {r.interval === 2 && (
                <Input
                  type="date"
                  value={r.anchor ?? ""}
                  onChange={(e) =>
                    setRecurring((list) =>
                      list.map((x, j) => (j === i ? { ...x, anchor: e.target.value } : x))
                    )
                  }
                  title={t("anchorHint")}
                  className="h-8 w-36"
                />
              )}
              <Input
                placeholder={t("blackoutLabel")}
                value={r.label ?? ""}
                onChange={(e) =>
                  setRecurring((list) =>
                    list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                  )
                }
                className="h-8 w-36"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRecurring((list) =>
                    list.map((x, j) =>
                      j === i ? { ...x, cron: "0 18 * * 2", durationMinutes: 60 } : x
                    )
                  )
                }
              >
                {t("cronMode")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRecurring((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">{t("removeBlackout")}</span>
              </Button>
            </div>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRecurring((list) => [
                ...list,
                { weekday: 2, from: "18:00", to: "19:00", interval: 1 as const, label: "" },
              ])
            }
          >
            <Plus className="size-3.5" />
            {t("addRecurring")}
          </Button>
        </div>

        <WeekOverridesSection semesterId={semesterId} initial={weekOverrides ?? null} />

        <div className="flex flex-wrap gap-2">
          <Button disabled={pending !== null} onClick={() => void onSave()}>
            {pending === "save" && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * A9: "this week I have less time". Picks an ISO week (native <input type="week">
 * already yields "YYYY-Www") plus an hour cap; the scheduler caps the whole
 * plan's assigned minutes that week. Save-on-change; removing clears the entry.
 */
function WeekOverridesSection({
  semesterId,
  initial,
}: {
  semesterId: string
  initial: WeekOverrides | null
}) {
  const t = useTranslations("semesterPlan.weekOverride")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [week, setWeek] = React.useState("")
  const [hours, setHours] = React.useState("")
  const [pending, setPending] = React.useState(false)

  const entries = Object.entries(initial ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))

  async function save(isoWeek: string, value: number | null) {
    setPending(true)
    try {
      await saveWeekOverride(semesterId, isoWeek, value)
      router.refresh()
    } catch (error) {
      showError(error)
    } finally {
      setPending(false)
    }
  }

  async function onAdd() {
    if (!week || hours === "") return
    await save(week, Math.max(0, Number(hours)))
    setWeek("")
    setHours("")
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-muted-foreground text-xs">{t("hint")}</p>
      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map(([w, h]) => (
            <li key={w} className="flex items-center gap-2 text-sm">
              <span className="font-medium tabular-nums">{w}</span>
              <span className="text-muted-foreground">{t("hours", { hours: h })}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                onClick={() => void save(w, null)}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">{t("remove")}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="week"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          aria-label={t("weekLabel")}
          className="h-8 w-40"
        />
        <Input
          type="number"
          min={0}
          max={168}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder={t("hoursLabel")}
          aria-label={t("hoursLabel")}
          className="h-8 w-24"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !week || hours === ""}
          onClick={() => void onAdd()}
        >
          <Plus className="size-3.5" />
          {t("add")}
        </Button>
      </div>
    </div>
  )
}
