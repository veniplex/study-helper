import { NextResponse } from "next/server"
import { and, eq, ilike, or, sql } from "drizzle-orm"
import { db } from "@/db"
import { degreeProgram, material, semester, studyEvent, studyModule } from "@/db/schema"
import { getSession } from "@/lib/auth/session"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ modules: [], materials: [], events: [] })
  const pattern = `%${q}%`

  const [modules, materials, events] = await Promise.all([
    db
      .select({
        id: studyModule.id,
        name: studyModule.name,
        programId: semester.programId,
      })
      .from(studyModule)
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .innerJoin(degreeProgram, eq(semester.programId, degreeProgram.id))
      .where(
        and(
          eq(degreeProgram.userId, session.user.id),
          or(ilike(studyModule.name, pattern), ilike(studyModule.code, pattern))
        )
      )
      .limit(5),
    db
      .select({ id: material.id, name: material.name, kind: material.kind, url: material.url })
      .from(material)
      .where(
        and(
          eq(material.userId, session.user.id),
          or(
            ilike(material.name, pattern),
            sql`${material.textContent} ILIKE ${pattern}`
          )
        )
      )
      .limit(5),
    db
      .select({ id: studyEvent.id, title: studyEvent.title, startsAt: studyEvent.startsAt })
      .from(studyEvent)
      .where(and(eq(studyEvent.userId, session.user.id), ilike(studyEvent.title, pattern)))
      .limit(5),
  ])

  return NextResponse.json({ modules, materials, events })
}
