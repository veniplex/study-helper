"use client"

import * as React from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import deLocale from "@fullcalendar/core/locales/de"
import type { EventClickArg, EventDropArg } from "@fullcalendar/core"
import type { EventResizeDoneArg } from "@fullcalendar/interaction"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { moveEvent } from "@/app/[locale]/(app)/calendar/actions"
import { EventDialog, type EventData, type ModuleOption } from "./event-dialog"
import type { EventType } from "@/db/schema/studies"
import { Card, CardContent } from "@/components/ui/card"

export type CalendarEvent = EventData & { id: string }

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

export type PlanCalendarItem = {
  id: string
  title: string
  date: string
  startTime: string | null
  durationMinutes: number
  done: boolean
}

export function CalendarView({
  events,
  modules,
  planItems = [],
}: {
  events: CalendarEvent[]
  modules: ModuleOption[]
  /** Semester study-plan sessions, shown read-only in their own color. */
  planItems?: PlanCalendarItem[]
}) {
  const locale = useLocale()
  const router = useRouter()
  const [selected, setSelected] = React.useState<EventData | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const byId = React.useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  function openEvent(arg: EventClickArg) {
    const data = byId.get(arg.event.id)
    if (!data) return
    setSelected(data)
    setDialogOpen(true)
  }

  function openNew(dateStr: string) {
    // dateStr is "YYYY-MM-DD" (month view) or full ISO (week view)
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

  return (
    <Card>
      <CardContent className="sh-calendar pt-4">
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
          events={[
            ...events.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.startsAt,
              end: e.endsAt ?? undefined,
              classNames: [TYPE_CLASS[e.type]],
            })),
            ...planItems.map((p) => {
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
            }),
          ]}
          eventClick={(arg) => {
            if (arg.event.id.startsWith("plan:")) return
            openEvent(arg)
          }}
          dateClick={(arg) => openNew(arg.dateStr)}
          eventDrop={onMove}
          eventResize={onMove}
        />
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
