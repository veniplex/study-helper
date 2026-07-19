import { NextResponse } from "next/server"
import { and, eq, exists, ilike, or, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  assignment,
  deck,
  degreeProgram,
  flashcard,
  material,
  moduleContact,
  question,
  quiz,
  semester,
  studyEvent,
  studyModule,
} from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { likePattern } from "@/lib/search/query"
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Debounced typing stays well below this; scripts hammering 7 parallel
  // ILIKE queries do not.
  if (!checkRateLimit(`search:${session.user.id}`, 60, 60 * 1000)) {
    return tooManyRequests()
  }

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
  const pattern = likePattern(q)
  // Full-text match over the (indexed) material text. websearch_to_tsquery
  // parses the raw user query safely (no manual escaping needed) and matches
  // the 'german' config of the generated text_content_tsv column + GIN index.
  const materialTextMatch = sql`${material.textContentTsv} @@ websearch_to_tsquery('german', ${q})`

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
          or(ilike(material.name, pattern), materialTextMatch)
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
      .where(
        and(
          eq(deck.userId, session.user.id),
          or(
            ilike(deck.name, pattern),
            // Widen to card content (front/back) — bounded to this deck.
            exists(
              db
                .select({ one: sql`1` })
                .from(flashcard)
                .where(
                  and(
                    eq(flashcard.deckId, deck.id),
                    or(ilike(flashcard.front, pattern), ilike(flashcard.back, pattern))
                  )
                )
            )
          )
        )
      )
      .limit(5),
    db
      .select({ id: quiz.id, title: quiz.title, ...moduleScope })
      .from(quiz)
      .innerJoin(studyModule, eq(quiz.moduleId, studyModule.id))
      .innerJoin(semester, eq(studyModule.semesterId, semester.id))
      .where(
        and(
          eq(quiz.userId, session.user.id),
          or(
            ilike(quiz.title, pattern),
            // Widen to question prompts — bounded to this quiz.
            exists(
              db
                .select({ one: sql`1` })
                .from(question)
                .where(and(eq(question.quizId, quiz.id), ilike(question.prompt, pattern)))
            )
          )
        )
      )
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
