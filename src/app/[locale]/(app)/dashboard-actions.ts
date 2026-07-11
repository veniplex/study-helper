"use server"

import { and, asc, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db"
import { studyEvent } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"

export type MiniCalendarEvent = {
  id: string
  title: string
  type: "exam" | "deadline" | "lecture" | "other"
  startsAt: string
  endsAt: string | null
  allDay: boolean
  aiGenerated: boolean
  moduleName: string | null
  moduleIcon: string | null
  moduleColor: string | null
}

/** Loads the user's events between two ISO timestamps for the mini calendar. */
export async function getMonthEvents(fromISO: string, toISO: string): Promise<MiniCalendarEvent[]> {
  const session = await requireSession()
  const from = new Date(fromISO)
  const to = new Date(toISO)
  const rows = await db.query.studyEvent.findMany({
    where: and(
      eq(studyEvent.userId, session.user.id),
      gte(studyEvent.startsAt, from),
      lte(studyEvent.startsAt, to)
    ),
    orderBy: [asc(studyEvent.startsAt)],
    with: { module: { columns: { name: true, icon: true, color: true } } },
  })
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
    allDay: e.allDay,
    aiGenerated: e.aiGenerated,
    moduleName: e.module?.name ?? null,
    moduleIcon: e.module?.icon ?? null,
    moduleColor: e.module?.color ?? null,
  }))
}
