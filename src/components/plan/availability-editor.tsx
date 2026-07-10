"use client"

import * as React from "react"
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  generateSemesterPlan,
  saveAvailability,
} from "@/app/[locale]/(app)/plan/actions"
import type { PlanAvailability } from "@/db/schema"
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
  hasPlan,
}: {
  semesterId: string
  initial: PlanAvailability | null
  hasPlan: boolean
}) {
  const t = useTranslations("semesterPlan")
  const router = useRouter()
  const [pending, setPending] = React.useState<"save" | "generate" | null>(null)
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
      weekly: WEEKDAYS.filter((d) => weekly[d].enabled).map((d) => ({
        weekday: d,
        from: weekly[d].from,
        to: weekly[d].to,
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
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(null)
    }
  }

  async function onGenerate() {
    setPending("generate")
    try {
      await saveAvailability(semesterId, payload())
      const result = await generateSemesterPlan(semesterId)
      toast.success(t("generated", { count: result.count }))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
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
                checked={weekly[d].enabled}
                onCheckedChange={(on) =>
                  setWeekly((w) => ({ ...w, [d]: { ...w[d], enabled: on } }))
                }
              />
              <Label htmlFor={`wd-${d}`} className="w-24 font-normal">
                {t(`weekdays.${d}`)}
              </Label>
              {weekly[d].enabled && (
                <>
                  <Input
                    type="time"
                    value={weekly[d].from}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, [d]: { ...w[d], from: e.target.value } }))
                    }
                    className="h-8 w-28"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={weekly[d].to}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, [d]: { ...w[d], to: e.target.value } }))
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
          {recurring.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={r.weekday}
                onChange={(e) =>
                  setRecurring((list) =>
                    list.map((x, j) =>
                      j === i ? { ...x, weekday: Number(e.target.value) } : x
                    )
                  )
                }
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                aria-label={t("recurringWeekday")}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`weekdays.${d}`)}
                  </option>
                ))}
              </select>
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
                size="icon-sm"
                onClick={() => setRecurring((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">{t("removeBlackout")}</span>
              </Button>
            </div>
          ))}
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

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending !== null} onClick={() => void onSave()}>
            {pending === "save" && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
          <Button disabled={pending !== null} onClick={() => void onGenerate()}>
            {pending === "generate" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {hasPlan ? t("regenerate") : t("generate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
