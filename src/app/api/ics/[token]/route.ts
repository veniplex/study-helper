import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { studyEvent, userPrefs } from "@/db/schema"
import { buildIcsCalendar } from "@/lib/ics"
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // Unauthenticated capability-URL route: throttle per IP so tokens can't be
  // brute-forced, generous enough for calendar apps polling on a schedule.
  if (!checkRateLimit(`ics:${clientIp(request)}`, 60, 10 * 60 * 1000)) {
    return tooManyRequests()
  }
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
