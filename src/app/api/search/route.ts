import { NextResponse } from "next/server"
import { and, eq, ilike, or, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  assignment,
  deck,
  degreeProgram,
  material,
  moduleContact,
  quiz,
  semester,
  studyEvent,
  studyModule,
} from "@/db/schema"
import { getSession } from "@/lib/auth/session"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({
      modules: [],
      materials: [],
      events: [],
      decks: [],
      quizzes: [],
      assignments: [],
      contacts: [],
    })
  }
  // Escape LIKE wildcards so user input matches literally
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`

  // Module-scoped entities join up to the program for link building.
  const moduleScope = {
    moduleId: studyModule.id,
    programId: semester.programId,
    moduleName: studyModule.name,
  }

  const [modules, materials, events, decks, quizzes, assignments, contacts] = await Promise.all([
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
    db
      .select({ id: deck.id, name: deck.name, ...moduleScope })
      .from(deck)
      .innerJoin(studyModule, eq(deck.moduleId, studyModule.id))
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .where(and(eq(deck.userId, session.user.id), ilike(deck.name, pattern)))
      .limit(5),
    db
      .select({ id: quiz.id, title: quiz.title, ...moduleScope })
      .from(quiz)
      .innerJoin(studyModule, eq(quiz.moduleId, studyModule.id))
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .where(and(eq(quiz.userId, session.user.id), ilike(quiz.title, pattern)))
      .limit(5),
    db
      .select({ id: assignment.id, title: assignment.title, ...moduleScope })
      .from(assignment)
      .innerJoin(studyModule, eq(assignment.moduleId, studyModule.id))
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .where(and(eq(assignment.userId, session.user.id), ilike(assignment.title, pattern)))
      .limit(5),
    db
      .select({ id: moduleContact.id, name: moduleContact.name, ...moduleScope })
      .from(moduleContact)
      .innerJoin(studyModule, eq(moduleContact.moduleId, studyModule.id))
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .innerJoin(degreeProgram, eq(semester.programId, degreeProgram.id))
      .where(
        and(
          eq(degreeProgram.userId, session.user.id),
          or(ilike(moduleContact.name, pattern), ilike(moduleContact.role, pattern))
        )
      )
      .limit(5),
  ])

  return NextResponse.json({ modules, materials, events, decks, quizzes, assignments, contacts })
}
