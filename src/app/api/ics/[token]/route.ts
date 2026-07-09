import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { studyEvent, userPrefs } from "@/db/schema"
import { buildIcsCalendar } from "@/lib/ics"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const prefs = await db.query.userPrefs.findFirst({ where: eq(userPrefs.icsToken, token) })
  if (!prefs) return new Response("Not found", { status: 404 })

  const events = await db.query.studyEvent.findMany({
    where: eq(studyEvent.userId, prefs.userId),
    orderBy: [asc(studyEvent.startsAt)],
  })

  const ics = buildIcsCalendar("StudyHelper", events)
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="studyhelper.ics"',
    },
  })
}
