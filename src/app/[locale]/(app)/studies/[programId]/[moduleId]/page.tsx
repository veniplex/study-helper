import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { ExternalLink, KeyRound } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import {
  assignment,
  externalResource,
  moduleContact,
  planTask,
  semesterPlan,
  studyModule,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { decrypt } from "@/lib/crypto"
import { expandAbsences } from "@/lib/plan/absences"
import { capacityMinutes, computeReadiness } from "@/lib/plan/readiness"
import { gradeGoalResult } from "@/lib/grades"
import { getModuleFinalGrade } from "@/lib/studies/grades-server"
import { getModuleStats } from "@/lib/learning/stats-server"
import { deleteResource } from "@/app/[locale]/(app)/studies/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { ResourceDialog } from "@/components/studies/resource-dialog"
import { AnalyzeButton } from "@/components/learn/analyze-button"
import type { GoalCardData } from "@/components/learn/goal-card"
import { ModuleGradeSummaryCard } from "@/components/learn/module-grade-summary-card"
import { ModuleContactsCard } from "@/components/learn/module-contacts-card"
import type { GoalReadinessDTO } from "@/components/learn/goal-card"
import { ModuleGoalsCard } from "@/components/studies/module-goals-card"
import { SessionStartDialog } from "@/components/learn/session-start-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ModuleOverviewPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies")

  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      semester: { with: { program: true } },
      grades: { orderBy: (g) => [asc(g.attempt), asc(g.createdAt)] },
      goals: {
        orderBy: (g) => [asc(g.sortOrder), asc(g.createdAt)],
        with: { attempts: { orderBy: (a) => [asc(a.attempt)] } },
      },
    },
  })
  if (
    !mod ||
    mod.semester.program.userId !== session.user.id ||
    mod.semester.programId !== programId
  ) {
    notFound()
  }

  // The grade goal's title still labels the module meta line.
  const gradeGoal = mod.goals.find((g) => g.gradingRole === "grade") ?? mod.goals[0] ?? null
  const examTypeLabel = gradeGoal?.title ?? null

  const gradingSystem = mod.semester.program.gradingSystem
  const gradeScale = mod.semester.program.gradeScale
  // Independent lookups — fetch them concurrently to keep TTFB low.
  const [resources, contacts, finalGrade, stats, assignments, aiAvailable, tStats, decks, quizzes] =
    await Promise.all([
      db.query.externalResource.findMany({
        where: eq(externalResource.moduleId, moduleId),
        orderBy: (r) => [asc(r.createdAt)],
      }),
      db.query.moduleContact.findMany({
        where: eq(moduleContact.moduleId, moduleId),
        orderBy: (c) => [asc(c.sortOrder), asc(c.createdAt)],
      }),
      getModuleFinalGrade(moduleId),
      getModuleStats(session.user.id, moduleId),
      db.query.assignment.findMany({
        where: eq(assignment.moduleId, moduleId),
        columns: { id: true, goalId: true, title: true, status: true, dueDate: true },
      }),
      isAiAvailable(),
      getTranslations("stats"),
      db.query.deck.findMany({
        where: (d, { and: a, eq: e }) =>
          a(e(d.userId, session.user.id), e(d.moduleId, moduleId)),
        columns: { id: true, name: true },
      }),
      db.query.quiz.findMany({
        where: (q, { and: a, eq: e }) =>
          a(e(q.userId, session.user.id), e(q.moduleId, moduleId)),
        columns: { id: true, title: true },
      }),
    ])

  // Attribute assignments without a goal to the module's first assignments goal.
  const firstAssignmentGoalId =
    mod.goals.find((g) => g.type === "assignments")?.id ?? null
  const assignmentStatsFor = (goalId: string) => {
    const own = assignments.filter(
      (a) => a.goalId === goalId || (a.goalId == null && goalId === firstAssignmentGoalId)
    )
    const nextDue = own
      .filter((a) => a.status === "open" && a.dueDate != null)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0]
    return {
      open: own.filter((a) => a.status === "open").length,
      submitted: own.filter((a) => a.status === "submitted").length,
      graded: own.filter((a) => a.status === "graded").length,
      nextDue: nextDue ? { title: nextDue.title, dueDate: nextDue.dueDate! } : null,
    }
  }

  const basePath = `/studies/${programId}/${moduleId}`
  const hasBonusGoal = mod.goals.some((g) => g.gradingRole === "bonus")
  const readinessStats = { dueCards: stats.dueCards, lastQuizScore: stats.lastQuizScore }

  // A7: traffic-light readiness for the module's nearest upcoming exam — open
  // task minutes vs. study capacity until the exam. null → no plan yet (the
  // goal card shows a neutral "set up your plan" hint instead of a light).
  const examGoal =
    mod.goals
      .filter((g) => (g.type === "exam" || g.type === "oral_exam") && g.dueDate)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0] ?? null
  const todayIso = new Date().toISOString().slice(0, 10)
  let readiness: GoalReadinessDTO = null
  if (examGoal?.dueDate && examGoal.dueDate > todayIso) {
    const [semPlan, openTasks] = await Promise.all([
      db.query.semesterPlan.findFirst({
        where: eq(semesterPlan.semesterId, mod.semesterId),
        columns: { availability: true, lastWarnings: true },
      }),
      db.query.planTask.findMany({
        where: and(eq(planTask.moduleId, moduleId), eq(planTask.done, false)),
        columns: { estimatedMinutes: true },
      }),
    ])
    if (semPlan && (semPlan.availability.weekly?.length ?? 0) > 0) {
      const remainingMinutes = openTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
      const blocked = expandAbsences(
        semPlan.availability,
        new Date(`${todayIso}T00:00:00`),
        new Date(`${examGoal.dueDate}T00:00:00`)
      ).map((w) => ({ date: w.date, from: w.from, to: w.to }))
      const capacity = capacityMinutes({
        today: todayIso,
        examDate: examGoal.dueDate,
        weekly: semPlan.availability.weekly,
        blocked,
      })
      readiness = {
        status: computeReadiness({ remainingMinutes, capacityMinutes: capacity }),
        warningKinds: (semPlan.lastWarnings ?? [])
          .filter((w) => w.moduleId == null || w.moduleId === moduleId)
          .map((w) => w.kind),
      }
    }
  }

  const goalCards: GoalCardData[] = mod.goals.map((g) => {
    const attempts = g.attempts.map((a) => ({
      id: a.id,
      attempt: a.attempt,
      resultPercent: a.resultPercent,
      date: a.date,
      passed: a.passed,
      note: a.note,
    }))
    const goalResult =
      g.gradingRole === "grade"
        ? gradeGoalResult(
            { weight: Number(g.weight), passFail: g.passFail, attempts: g.attempts },
            gradeScale
          )
        : null
    return {
      goal: {
        id: g.id,
        type: g.type,
        title: g.title,
        gradingRole: g.gradingRole,
        weight: g.weight,
        maxAttempts: g.maxAttempts,
        passFail: g.passFail,
        dueDate: g.dueDate,
        config: g.config,
      },
      attempts,
      goalResult: goalResult
        ? {
            grade: goalResult.grade,
            percent: goalResult.percent,
            passed: goalResult.passed,
            attempt: goalResult.attempt,
          }
        : null,
      assignmentStats: g.type === "assignments" ? assignmentStatsFor(g.id) : null,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        {aiAvailable && (
          <AnalyzeButton moduleId={moduleId} basePath={`/studies/${programId}/${moduleId}`} />
        )}
        <SessionStartDialog
          basePath={`/studies/${programId}/${moduleId}`}
          moduleId={moduleId}
          decks={decks}
          quizzes={quizzes}
        />
      </div>
      <dl className="grid grid-cols-3 gap-4">
        {[
          [tStats("dueCards"), String(stats.dueCards)],
          [
            tStats("lastQuizScore"),
            stats.lastQuizScore != null ? `${stats.lastQuizScore}%` : "–",
          ],
          [
            tStats("studyTime"),
            `${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`,
          ],
        ].map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      {(mod.instructor || examTypeLabel || mod.notes) && (
        <div>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {mod.instructor && <span>{mod.instructor}</span>}
            {examTypeLabel && <span>{examTypeLabel}</span>}
          </div>
          {mod.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{mod.notes}</p>}
        </div>
      )}

      <ModuleGoalsCard
        moduleId={mod.id}
        basePath={basePath}
        cards={goalCards}
        gradingSystem={gradingSystem}
        stats={readinessStats}
        bonus={finalGrade?.bonus ?? null}
        readiness={readiness}
      />

      {finalGrade &&
        (finalGrade.source != null || mod.grades.length > 0 || hasBonusGoal) && (
          <ModuleGradeSummaryCard
            gradingSystem={gradingSystem}
            final={finalGrade}
            legacyGrades={mod.grades.map((g) => ({
              id: g.id,
              value: g.value,
              weight: g.weight,
              attempt: g.attempt,
              gradedAt: g.gradedAt,
              note: g.note,
            }))}
            hasBonusGoal={hasBonusGoal}
          />
        )}

      <ModuleContactsCard moduleId={mod.id} contacts={contacts} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("resources.title")}</CardTitle>
            <CardDescription>{t("resources.description")}</CardDescription>
          </div>
          <ResourceDialog moduleId={mod.id} />
        </CardHeader>
        <CardContent>
          {resources.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("resources.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {resources.map((r) => {
                const note = r.encryptedNote ? decrypt(r.encryptedNote) : null
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Badge variant="secondary">{t(`resources.types.${r.type}`)}</Badge>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    >
                      {r.name}
                      <ExternalLink className="size-3" />
                    </a>
                    {r.username && (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <KeyRound className="size-3" />
                        {r.username}
                      </span>
                    )}
                    {note && <span className="text-muted-foreground text-xs">{note}</span>}
                    <span className="ml-auto flex items-center gap-1">
                      <ResourceDialog
                        moduleId={mod.id}
                        resource={{
                          id: r.id,
                          type: r.type,
                          name: r.name,
                          url: r.url,
                          username: r.username,
                          note,
                        }}
                      />
                      <DeleteButton action={deleteResource.bind(null, r.id)} />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
