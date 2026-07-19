import { asc, eq, ne, and, isNotNull, inArray, gte, lte } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { toIsoDate } from "@/lib/events/recurrence"
import {
  assignment,
  degreeProgram,
  planSession,
  semesterPlan,
  studyEvent,
  userPrefs,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { expandAbsences } from "@/lib/plan/absences"
import { CalendarView } from "@/components/calendar/calendar-view"
import { EventDialog, type ModuleOption } from "@/components/calendar/event-dialog"
import { IcsCard } from "@/components/calendar/ics-card"
import { IcsImportCard } from "@/components/calendar/ics-import-card"

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const session = await requireSession()
  const t = await getTranslations("calendar")
  // Deep link from the command palette: focus/open this event on load (E24).
  const { event: focusEventId } = await searchParams

  const userPlans = await db.query.semesterPlan.findMany({
    where: eq(semesterPlan.userId, session.user.id),
    columns: { id: true, availability: true },
  })
  const planIds = userPlans.map((p) => p.id)

  // Bound plan sessions to a sane window instead of loading every session ever.
  const now = new Date()
  const sessionFrom = toIsoDate(new Date(now.getTime() - 60 * 86400000))
  const sessionTo = toIsoDate(new Date(now.getTime() + 365 * 86400000))

  const [allEvents, prefs, programs, planSessions, dueAssignments] = await Promise.all([
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
    planIds.length
      ? db.query.planSession.findMany({
          where: and(
            inArray(planSession.semesterPlanId, planIds),
            gte(planSession.date, sessionFrom),
            lte(planSession.date, sessionTo)
          ),
          with: {
            module: { columns: { name: true } },
            tasks: {
              orderBy: (task, { asc: a }) => [a(task.sortOrder)],
              columns: { id: true, title: true, done: true },
            },
          },
        })
      : Promise.resolve([]),
    db.query.assignment.findMany({
      where: and(
        eq(assignment.userId, session.user.id),
        isNotNull(assignment.dueDate),
        ne(assignment.status, "graded")
      ),
      with: { module: { with: { semester: true } } },
    }),
  ])

  const modules: ModuleOption[] = programs.flatMap((p) =>
    p.semesters.flatMap((s) => s.modules.map((m) => ({ id: m.id, name: m.name })))
  )

  // Expand plan unavailability into concrete windows for ±6 months
  const from = new Date()
  from.setMonth(from.getMonth() - 6)
  const to = new Date()
  to.setMonth(to.getMonth() + 6)
  const absences = userPlans.flatMap((p) => expandAbsences(p.availability, from, to))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <EventDialog modules={modules} />
      </div>

      <CalendarView
        modules={modules}
        focusEventId={focusEventId}
        events={allEvents.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          startsAt: toLocalInputValue(e.startsAt),
          endsAt: e.endsAt ? toLocalInputValue(e.endsAt) : null,
          location: e.location,
          notes: e.notes,
          moduleId: e.moduleId,
          allDay: e.allDay,
          reminderOffsets: e.reminderOffsets,
          recurrence: e.recurrence,
          recurrenceUntil: e.recurrenceUntil,
          recurrenceWeekdays: e.recurrenceWeekdays,
          recurrenceInterval: e.recurrenceInterval,
          skipDates: e.skipDates,
        }))}
        planSessions={planSessions.map((s) => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          durationMinutes: s.durationMinutes,
          done: s.done,
          moduleId: s.moduleId,
          moduleName: s.module?.name ?? null,
          tasks: s.tasks.map((task) => ({ id: task.id, title: task.title, done: task.done })),
        }))}
        assignments={dueAssignments.map((a) => ({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate!,
          moduleId: a.moduleId,
          moduleName: a.module.name,
          href: `/studies/${a.module.semester.programId}/${a.moduleId}/assignments`,
        }))}
        absences={absences}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <IcsCard appUrl={env.APP_URL} token={prefs?.icsToken ?? null} />
        <IcsImportCard />
      </div>
    </div>
  )
}
