import { asc, eq } from "drizzle-orm"
import { CalendarDays, MapPin } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { degreeProgram, studyEvent, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { deleteEvent } from "./actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { CalendarView } from "@/components/calendar/calendar-view"
import { EventDialog, type ModuleOption } from "@/components/calendar/event-dialog"
import { IcsCard } from "@/components/calendar/ics-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const typeVariant = {
  exam: "destructive",
  deadline: "default",
  lecture: "secondary",
  other: "outline",
} as const

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function CalendarPage() {
  const session = await requireSession()
  const t = await getTranslations("calendar")
  const format = await getFormatter()
  const now = new Date()

  const [allEvents, prefs, programs] = await Promise.all([
    db.query.studyEvent.findMany({
      where: eq(studyEvent.userId, session.user.id),
      orderBy: [asc(studyEvent.startsAt)],
      with: { module: true },
    }),
    db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, session.user.id) }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, session.user.id),
      with: { semesters: { with: { modules: true } } },
    }),
  ])
  const upcoming = allEvents.filter((e) => e.startsAt >= now)

  const modules: ModuleOption[] = programs.flatMap((p) =>
    p.semesters.flatMap((s) => s.modules.map((m) => ({ id: m.id, name: m.name })))
  )

  const typeLabels = {
    exam: t("event.typeExam"),
    deadline: t("event.typeDeadline"),
    lecture: t("event.typeLecture"),
    other: t("event.typeOther"),
  } as const

  function EventRow({ event }: { event: (typeof upcoming)[number] }) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5 text-sm">
        <Badge variant={typeVariant[event.type]}>{typeLabels[event.type]}</Badge>
        <span className="font-medium">{event.title}</span>
        {event.module && (
          <span className="text-muted-foreground text-xs">{event.module.name}</span>
        )}
        <span className="text-muted-foreground ml-auto flex items-center gap-3 text-xs">
          {event.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {event.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" />
            {format.dateTime(event.startsAt, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </span>
        <span className="flex gap-1">
          <EventDialog
            modules={modules}
            event={{
              id: event.id,
              title: event.title,
              type: event.type,
              startsAt: toLocalInputValue(event.startsAt),
              endsAt: event.endsAt ? toLocalInputValue(event.endsAt) : null,
              location: event.location,
              notes: event.notes,
              moduleId: event.moduleId,
              reminderOffsets: event.reminderOffsets,
            }}
          />
          <DeleteButton action={deleteEvent.bind(null, event.id)} />
        </span>
      </li>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <EventDialog modules={modules} />
      </div>

      <CalendarView
        modules={modules}
        events={allEvents.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          startsAt: toLocalInputValue(e.startsAt),
          endsAt: e.endsAt ? toLocalInputValue(e.endsAt) : null,
          location: e.location,
          notes: e.notes,
          moduleId: e.moduleId,
          reminderOffsets: e.reminderOffsets,
        }))}
      />

      {upcoming.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">{t("upcoming")}</h2>
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </div>
      )}

      <IcsCard appUrl={env.APP_URL} token={prefs?.icsToken ?? null} />
    </div>
  )
}
