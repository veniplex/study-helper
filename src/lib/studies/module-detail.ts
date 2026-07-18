import "server-only"
import { and, asc, eq, gte } from "drizzle-orm"
import { db } from "@/db"
import { assignment, deck, quiz, studyEvent, studyModule } from "@/db/schema"
import { ownModule } from "./access"
import { getModuleFinalGrade } from "./grades-server"
import { effectiveBonus, type BonusAssignment } from "@/lib/grades"

function assignmentPercent(achieved: string | null, max: string | null): number | null {
  if (achieved == null || max == null) return null
  const m = Number(max)
  return m ? Math.round((Number(achieved) / m) * 100) : null
}

/**
 * Full module detail for the AI's getModuleDetails tool. Ownership is enforced.
 * Arrays are capped and long text omitted to keep the payload compact.
 */
export async function getModuleDetail(userId: string, moduleId: string) {
  await ownModule(moduleId, userId)

  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      semester: { columns: { name: true, startDate: true, endDate: true } },
      goals: {
        orderBy: (g) => [asc(g.sortOrder), asc(g.createdAt)],
        with: { attempts: { orderBy: (a) => [asc(a.attempt)] } },
      },
      contacts: { columns: { name: true, email: true, role: true } },
    },
  })
  if (!mod) throw new Error("Not found")

  const [assignments, events, decks, quizzes, final] = await Promise.all([
    db.query.assignment.findMany({
      where: eq(assignment.moduleId, moduleId),
      orderBy: [asc(assignment.dueDate)],
      limit: 25,
      columns: {
        title: true,
        kind: true,
        status: true,
        dueDate: true,
        pointsAchieved: true,
        pointsMax: true,
      },
    }),
    db.query.studyEvent.findMany({
      where: and(eq(studyEvent.moduleId, moduleId), gte(studyEvent.startsAt, new Date())),
      orderBy: [asc(studyEvent.startsAt)],
      limit: 10,
      columns: { title: true, type: true, startsAt: true, allDay: true },
    }),
    db.query.deck.findMany({ where: eq(deck.moduleId, moduleId), columns: { id: true } }),
    db.query.quiz.findMany({ where: eq(quiz.moduleId, moduleId), columns: { id: true } }),
    getModuleFinalGrade(moduleId),
  ])

  const bonusAssignments: BonusAssignment[] = assignments.map((a) => ({
    kind: a.kind,
    status: a.status,
    percent: assignmentPercent(a.pointsAchieved, a.pointsMax),
  }))
  const bonusConfig = mod.goals.find((g) => g.gradingRole === "bonus")?.config.bonus ?? null
  const bonus = effectiveBonus(bonusConfig, bonusAssignments)

  return {
    name: mod.name,
    code: mod.code,
    status: mod.status,
    ects: mod.ects,
    instructor: mod.instructor,
    semester: mod.semester
      ? { name: mod.semester.name, startDate: mod.semester.startDate, endDate: mod.semester.endDate }
      : null,
    finalGrade: final
      ? { grade: final.grade, percent: final.percent, passed: final.passed, attempt: final.attempt }
      : null,
    goals: mod.goals.map((g) => ({
      type: g.type,
      title: g.title,
      gradingRole: g.gradingRole,
      passFail: g.passFail,
      maxAttempts: g.maxAttempts,
      dueDate: g.dueDate,
      attempts: g.attempts.map((a) => ({
        attempt: a.attempt,
        resultPercent: a.resultPercent != null ? Number(a.resultPercent) : null,
        passed: a.passed,
        date: a.date,
      })),
    })),
    bonus: {
      type: bonusConfig?.type ?? "none",
      value: bonusConfig?.value ?? null,
      conditionMet: bonus.conditionMet,
      avgPercent: Math.round(bonus.avgPercent),
      completedShare: Math.round(bonus.completedShare * 100),
    },
    contacts: mod.contacts,
    assignments: assignments.map((a) => ({
      title: a.title,
      kind: a.kind,
      status: a.status,
      dueDate: a.dueDate,
      percent: assignmentPercent(a.pointsAchieved, a.pointsMax),
    })),
    upcomingEvents: events,
    deckCount: decks.length,
    quizCount: quizzes.length,
  }
}
