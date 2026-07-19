"use client"

import * as React from "react"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { getMonthEvents, type MiniCalendarEvent } from "@/app/[locale]/(app)/dashboard-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { cn } from "@/lib/utils"

const TYPE_DOT: Record<MiniCalendarEvent["type"], string> = {
  exam: "bg-red-500",
  deadline: "bg-amber-500",
  lecture: "bg-sky-500",
  other: "bg-violet-500",
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function ModuleGlyph({ iconKey, className }: { iconKey: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
}

export function MiniCalendar({
  initialEvents,
  year,
  month,
}: {
  initialEvents: MiniCalendarEvent[]
  year: number
  month: number // 0-based
}) {
  const t = useTranslations("dashboard.miniCalendar")
  const tCal = useTranslations("calendar")
  const format = useFormatter()

  const [events, setEvents] = React.useState<MiniCalendarEvent[]>(initialEvents)
  const [view, setView] = React.useState({ year, month })
  const [selected, setSelected] = React.useState(() => dayKey(new Date()))
  const cache = React.useRef<Map<string, MiniCalendarEvent[]>>(new Map())

  const typeLabels: Record<MiniCalendarEvent["type"], string> = {
    exam: tCal("event.typeExam"),
    deadline: tCal("event.typeDeadline"),
    lecture: tCal("event.typeLecture"),
    other: tCal("event.typeOther"),
  }

  // Group events by local day key.
  const byDay = React.useMemo(() => {
    const map = new Map<string, MiniCalendarEvent[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.startsAt))
      const list = map.get(k) ?? []
      list.push(e)
      map.set(k, list)
    }
    return map
  }, [events])

  async function goToMonth(y: number, m: number) {
    setView({ year: y, month: m })
    const key = `${y}-${m}`
    if (cache.current.has(key)) {
      setEvents(cache.current.get(key)!)
      return
    }
    const from = new Date(y, m, 1).toISOString()
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
    try {
      const rows = await getMonthEvents(from, to)
      cache.current.set(key, rows)
      setEvents(rows)
    } catch {
      setEvents([])
    }
  }

  const prev = () => {
    const m = view.month - 1
    if (m < 0) void goToMonth(view.year - 1, 11)
    else void goToMonth(view.year, m)
  }
  const next = () => {
    const m = view.month + 1
    if (m > 11) void goToMonth(view.year + 1, 0)
    else void goToMonth(view.year, m)
  }

  // Build the month grid (Monday-first).
  const first = new Date(view.year, view.month, 1)
  const leading = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = dayKey(new Date())
  const monthLabel = format.dateTime(first, { month: "long", year: "numeric" })
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    // 2024-01-01 is a Monday — build short weekday names starting Monday.
    const d = new Date(2024, 0, 1 + i)
    return format.dateTime(d, { weekday: "short" })
  })

  const selectedEvents = (byDay.get(selected) ?? []).sort((a, b) => {
    const at = a.allDay ? 0 : new Date(a.startsAt).getTime()
    const bt = b.allDay ? 0 : new Date(b.startsAt).getTime()
    return at - bt
  })

  const timeOpts = { hour: "2-digit", minute: "2-digit" } as const
  function eventTime(e: MiniCalendarEvent): string {
    if (e.allDay) return t("allDay")
    const start = format.dateTime(new Date(e.startsAt), timeOpts)
    if (e.endsAt) return `${start}–${format.dateTime(new Date(e.endsAt), timeOpts)}`
    return start
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Link
          href="/calendar"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          {t("openCalendar")}
          <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={prev}
              className="hover:bg-accent text-muted-foreground rounded p-1"
              aria-label="prev"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={next}
              className="hover:bg-accent text-muted-foreground rounded p-1"
              aria-label="next"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-x-1 gap-y-0.5 text-center">
          {weekdays.map((w, i) => (
            <span
              key={w}
              className={cn(
                "text-[11px] font-medium",
                i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground"
              )}
            >
              {w}
            </span>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <span key={`e${i}`} />
            const key = dayKey(new Date(view.year, view.month, day))
            const dayEvents = byDay.get(key) ?? []
            const isToday = key === todayKey
            const isSelected = key === selected
            const isWeekend = i % 7 >= 5
            const dotTypes = [...new Set(dayEvents.map((e) => e.type))].slice(0, 3)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-md text-xs transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "hover:bg-accent",
                  !isSelected && isWeekend && "text-muted-foreground/60",
                  !isSelected && isToday && "ring-primary ring-1"
                )}
              >
                <span className="tabular-nums">{day}</span>
                <span className="flex h-1 items-center gap-0.5">
                  {dotTypes.map((type) => (
                    <span
                      key={type}
                      className={cn(
                        "size-1 rounded-full",
                        isSelected ? "bg-primary-foreground" : TYPE_DOT[type]
                      )}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-t pt-3">
          {selectedEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noEvents")}</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href="/calendar"
                    className="hover:bg-accent -mx-1.5 grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded-md px-1.5 py-0.5 text-sm transition-colors"
                  >
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {eventTime(e)}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn("size-1.5 shrink-0 rounded-full", TYPE_DOT[e.type])} />
                      <span className="truncate font-medium">{e.title}</span>
                      {e.aiGenerated && <AiBadge iconOnly />}
                    </span>
                    {e.moduleName ? (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <ModuleGlyph
                          iconKey={e.moduleIcon}
                          className={cn("size-3", getModuleColorClasses(e.moduleColor).text)}
                        />
                        <span className="max-w-24 truncate">{e.moduleName}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">{typeLabels[e.type]}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
