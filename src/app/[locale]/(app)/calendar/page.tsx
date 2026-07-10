import { asc, eq, ne, and, isNotNull } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { assignment, degreeProgram, semesterPlan, studyEvent, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { expandAbsences } from "@/lib/plan/absences"
import { CalendarView } from "@/components/calendar/calendar-view"
import { EventDialog, type ModuleOption } from "@/components/calendar/event-dialog"
import { IcsCard } from "@/components/calendar/ics-card"

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function CalendarPage() {
  const session = await requireSession()
  const t = await getTranslations("calendar")

  const [allEvents, prefs, programs, planItems, plans, dueAssignments] = await Promise.all([
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
    db.query.semesterPlanItem.findMany({
      where: (item, { exists, and: a, eq: e }) =>
        exists(
          db
            .select()
            .from(semesterPlan)
            .where(a(e(semesterPlan.id, item.planId), e(semesterPlan.userId, session.user.id)))
        ),
      columns: {
        id: true,
        title: true,
        date: true,
        startTime: true,
        durationMinutes: true,
        done: true,
        moduleId: true,
      },
    }),
    db.query.semesterPlan.findMany({
      where: eq(semesterPlan.userId, session.user.id),
      columns: { availability: true },
    }),
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
  const absences = plans.flatMap((p) => expandAbsences(p.availability, from, to))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
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
          allDay: e.allDay,
          reminderOffsets: e.reminderOffsets,
        }))}
        planItems={planItems}
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

      <IcsCard appUrl={env.APP_URL} token={prefs?.icsToken ?? null} />
    </div>
  )
}
