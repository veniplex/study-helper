"use client"

import * as React from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import deLocale from "@fullcalendar/core/locales/de"
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core"
import type { EventResizeDoneArg } from "@fullcalendar/interaction"
import { Pencil, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deleteEvent, moveEvent } from "@/app/[locale]/(app)/calendar/actions"
import { EventDialog, type EventData, type ModuleOption } from "./event-dialog"
import type { EventType } from "@/db/schema/studies"
import type { AbsenceWindow } from "@/lib/plan/absences"
import { expandOccurrences } from "@/lib/events/recurrence"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type CalendarEvent = EventData & { id: string }

export type PlanCalendarItem = {
  id: string
  title: string
  date: string
  startTime: string | null
  durationMinutes: number
  done: boolean
  moduleId: string | null
}

export type AssignmentCalendarItem = {
  id: string
  title: string
  dueDate: string
  moduleId: string
  moduleName: string
  href: string
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const TYPE_CLASS: Record<EventType, string> = {
  exam: "sh-event-exam",
  deadline: "sh-event-deadline",
  lecture: "sh-event-lecture",
  other: "sh-event-other",
}

type CategoryKey = EventType | "assignment" | "plan" | "absence"

const CATEGORIES: CategoryKey[] = [
  "exam",
  "deadline",
  "lecture",
  "other",
  "assignment",
  "plan",
  "absence",
]

const CATEGORY_DOT: Record<CategoryKey, string> = {
  exam: "bg-red-500",
  deadline: "bg-amber-500",
  lecture: "bg-sky-500",
  other: "bg-violet-500",
  assignment: "bg-amber-500",
  plan: "bg-emerald-500",
  absence: "bg-zinc-400",
}

export function CalendarView({
  events,
  modules,
  planItems = [],
  assignments = [],
  absences = [],
}: {
  events: CalendarEvent[]
  modules: ModuleOption[]
  planItems?: PlanCalendarItem[]
  assignments?: AssignmentCalendarItem[]
  /** Unavailability windows from the study plans, shown as background. */
  absences?: AbsenceWindow[]
}) {
  const locale = useLocale()
  const t = useTranslations("calendar.filters")
  const tEvent = useTranslations("calendar.event")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [selected, setSelected] = React.useState<EventData | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [moduleFilter, setModuleFilter] = React.useState("")
  const [hidden, setHidden] = React.useState<Set<CategoryKey>>(new Set())
  const [ctxMenu, setCtxMenu] = React.useState<{ id: string; x: number; y: number } | null>(null)

  // Close the right-click menu on any outside interaction.
  React.useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", close)
    }
  }, [ctxMenu])

  const byId = React.useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const categoryLabels: Record<CategoryKey, string> = {
    exam: tEvent("typeExam"),
    deadline: tEvent("typeDeadline"),
    lecture: tEvent("typeLecture"),
    other: tEvent("typeOther"),
    assignment: t("assignments"),
    plan: t("plan"),
    absence: t("absences"),
  }

  function toggleCategory(key: CategoryKey) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function matchesModule(moduleId: string | null | undefined): boolean {
    return !moduleFilter || moduleId === moduleFilter
  }

  function openEvent(arg: EventClickArg) {
    const data = byId.get(arg.event.id)
    if (!data) return
    setSelected(data)
    setDialogOpen(true)
  }

  function editById(id: string) {
    const data = byId.get(id)
    if (!data) return
    setSelected(data)
    setDialogOpen(true)
  }

  async function deleteById(id: string) {
    try {
      await deleteEvent(id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  function openNew(dateStr: string) {
    const startsAt = dateStr.includes("T")
      ? toLocalInputValue(new Date(dateStr))
      : `${dateStr}T09:00`
    setSelected({
      title: "",
      type: "exam",
      startsAt,
      endsAt: null,
      location: null,
      notes: null,
      moduleId: null,
      allDay: false,
      reminderOffsets: [1440],
    })
    setDialogOpen(true)
  }

  async function onMove(arg: EventDropArg | EventResizeDoneArg) {
    try {
      await moveEvent(arg.event.id, {
        startsAt: toLocalInputValue(arg.event.start!),
        endsAt: arg.event.end ? toLocalInputValue(arg.event.end) : null,
      })
      router.refresh()
    } catch (error) {
      arg.revert()
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const fcEvents: EventInput[] = [
    ...events
      .filter((e) => !hidden.has(e.type) && matchesModule(e.moduleId))
      .flatMap((e) => {
        if (!e.recurrence || e.recurrence === "none") {
          return [
            {
              id: e.id,
              title: e.title,
              start: e.allDay ? e.startsAt.slice(0, 10) : e.startsAt,
              end: e.endsAt ? (e.allDay ? e.endsAt.slice(0, 10) : e.endsAt) : undefined,
              allDay: e.allDay ?? false,
              classNames: [TYPE_CLASS[e.type]],
            },
          ]
        }
        // Expand the series around today; instances share the base event's dialog.
        const from = new Date()
        from.setMonth(from.getMonth() - 6)
        const to = new Date()
        to.setMonth(to.getMonth() + 12)
        return expandOccurrences(
          {
            startsAt: new Date(e.startsAt),
            endsAt: e.endsAt ? new Date(e.endsAt) : null,
            recurrence: e.recurrence,
            recurrenceUntil: e.recurrenceUntil ?? null,
            recurrenceWeekdays: e.recurrenceWeekdays ?? null,
            recurrenceInterval: e.recurrenceInterval ?? null,
          },
          from,
          to
        ).map((occ) => ({
          id: occ.isRecurrenceInstance ? `recur:${e.id}:${occ.occurrenceDate}` : e.id,
          title: e.title,
          start: e.allDay ? occ.occurrenceDate : toLocalInputValue(occ.startsAt),
          end: occ.endsAt
            ? e.allDay
              ? occ.occurrenceDate
              : toLocalInputValue(occ.endsAt)
            : undefined,
          allDay: e.allDay ?? false,
          editable: !occ.isRecurrenceInstance,
          classNames: [TYPE_CLASS[e.type]],
        }))
      }),
    ...(!hidden.has("plan")
      ? planItems
          .filter((p) => matchesModule(p.moduleId))
          .map((p) => {
            const start = p.startTime ? `${p.date}T${p.startTime}` : p.date
            const end = p.startTime
              ? toLocalInputValue(
                  new Date(new Date(start).getTime() + p.durationMinutes * 60000)
                )
              : undefined
            return {
              id: `plan:${p.id}`,
              title: p.title,
              start,
              end,
              editable: false,
              classNames: ["sh-event-plan", ...(p.done ? ["sh-event-plan-done"] : [])],
            }
          })
      : []),
    ...(!hidden.has("assignment")
      ? assignments
          .filter((a) => matchesModule(a.moduleId))
          .map((a) => ({
            id: `assignment:${a.id}`,
            title: `📋 ${a.title}`,
            start: a.dueDate,
            allDay: true,
            editable: false,
            classNames: ["sh-event-assignment"],
            extendedProps: { href: a.href },
          }))
      : []),
    ...(!hidden.has("absence") && !moduleFilter
      ? absences.map((a, i) => ({
          id: `absence:${i}`,
          title: a.label ?? categoryLabels.absence,
          start: a.from ? `${a.date}T${a.from}` : a.date,
          end: a.to ? `${a.date}T${a.to}` : undefined,
          allDay: a.from == null,
          display: "background" as const,
          editable: false,
          classNames: ["sh-event-absence"],
        }))
      : []),
  ]

  return (
    <Card>
      <CardContent className="sh-calendar space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {modules.length > 0 && (
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v ?? "")}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue>
                  {modules.find((m) => m.id === moduleFilter)?.name ?? t("allModules")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("allModules")}</SelectItem>
                {modules.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleCategory(key)}
              aria-pressed={!hidden.has(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                hidden.has(key)
                  ? "text-muted-foreground opacity-50"
                  : "hover:border-foreground/30"
              )}
            >
              <span className={cn("size-2 rounded-full", CATEGORY_DOT[key])} />
              {categoryLabels[key]}
            </button>
          ))}
        </div>

        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          locales={[deLocale]}
          locale={locale === "de" ? "de" : "en"}
          firstDay={1}
          height="auto"
          dayMaxEventRows={3}
          nowIndicator
          editable
          events={fcEvents}
          eventClick={(arg) => {
            if (arg.event.id.startsWith("assignment:")) {
              const href = (arg.event.extendedProps as { href?: string }).href
              if (href) router.push(href)
              return
            }
            if (arg.event.id.startsWith("recur:")) {
              // Instances open the base event (edits apply to the whole series).
              editById(arg.event.id.split(":")[1])
              return
            }
            if (arg.event.id.includes(":")) return
            openEvent(arg)
          }}
          dateClick={(arg) => openNew(arg.dateStr)}
          eventDrop={onMove}
          eventResize={onMove}
          eventDidMount={(info) => {
            // Right-click a real event → edit/delete menu (instances target the series).
            const isInstance = info.event.id.startsWith("recur:")
            if (info.event.id.includes(":") && !isInstance) return
            const baseId = isInstance ? info.event.id.split(":")[1] : info.event.id
            info.el.addEventListener("contextmenu", (e) => {
              e.preventDefault()
              setCtxMenu({ id: baseId, x: e.clientX, y: e.clientY })
            })
          }}
        />
        {ctxMenu && (
          <div
            className="bg-popover text-popover-foreground fixed z-50 min-w-40 rounded-lg border p-1 shadow-md ring-1 ring-foreground/10"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              onClick={() => {
                editById(ctxMenu.id)
                setCtxMenu(null)
              }}
            >
              <Pencil className="size-4" />
              {tCommon("edit")}
            </button>
            <button
              type="button"
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              onClick={() => {
                void deleteById(ctxMenu.id)
                setCtxMenu(null)
              }}
            >
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </button>
          </div>
        )}
        <EventDialog
          key={selected?.id ?? `new-${selected?.startsAt ?? ""}`}
          modules={modules}
          event={selected ?? undefined}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      </CardContent>
    </Card>
  )
}
