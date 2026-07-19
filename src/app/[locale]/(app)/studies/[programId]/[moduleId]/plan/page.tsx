import { and, asc, eq, gte } from "drizzle-orm"
import { db } from "@/db"
import { moduleGoal, moduleOutline, outlineTopic, planSession, planTask, semesterPlan } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { ensureModulePlan } from "@/app/[locale]/(app)/plan/plan-task-actions"
import { ModulePlanView } from "@/components/plan/module-plan-view"
import type { SetupStep } from "@/components/plan/setup-checklist"

export default async function ModulePlanPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const basePath = `/studies/${programId}/${moduleId}`

  const modulePlan = await ensureModulePlan(moduleId)

  const today = new Date().toISOString().slice(0, 10)
  const [tasks, goals, sessions, plan, outline] = await Promise.all([
    db.query.planTask.findMany({
      where: eq(planTask.moduleId, moduleId),
      orderBy: [asc(planTask.sortOrder)],
    }),
    db.query.moduleGoal.findMany({
      where: eq(moduleGoal.moduleId, moduleId),
      orderBy: [asc(moduleGoal.sortOrder)],
      columns: { id: true, type: true, title: true, dueDate: true },
    }),
    db.query.planSession.findMany({
      where: and(eq(planSession.moduleId, moduleId), gte(planSession.date, today)),
      orderBy: [asc(planSession.date), asc(planSession.startTime)],
      with: { tasks: { columns: { id: true, title: true, done: true } } },
    }),
    db.query.semesterPlan.findFirst({
      where: eq(semesterPlan.semesterId, mod.semesterId),
      columns: { availability: true, generatedAt: true },
    }),
    db.query.moduleOutline.findFirst({
      where: eq(moduleOutline.moduleId, moduleId),
      columns: { version: true },
    }),
  ])

  const outlineTopicCount = outline
    ? (
        await db.query.outlineTopic.findMany({
          where: and(eq(outlineTopic.moduleId, moduleId), eq(outlineTopic.version, outline.version)),
          columns: { id: true },
        })
      ).length
    : 0

  const examGoals = goals.filter((g) => g.type === "exam" || g.type === "oral_exam")
  const hasExamGoal = examGoals.length > 0
  const hasAvailability = (plan?.availability.weekly?.length ?? 0) > 0
  const hasPlan = sessions.length > 0 || plan?.generatedAt != null

  // Module-scoped setup checklist: the exam date, availability, tasks and the
  // computed plan. (The module itself already exists on this page.)
  const setupSteps: SetupStep[] = [
    { key: "examDate", done: examGoals.some((g) => g.dueDate != null), href: basePath },
    { key: "availability", done: hasAvailability, href: `/plan/${mod.semesterId}` },
    { key: "tasks", done: tasks.length > 0, href: `${basePath}/plan` },
    { key: "plan", done: hasPlan, href: `/plan/${mod.semesterId}` },
  ]

  return (
    <ModulePlanView
      moduleId={moduleId}
      semesterId={mod.semesterId}
      basePath={basePath}
      prefs={{
        active: modulePlan.active,
        weight: Number(modulePlan.weight),
        weeklyHoursTarget:
          modulePlan.weeklyHoursTarget == null ? null : Number(modulePlan.weeklyHoursTarget),
        phase: modulePlan.phase,
        preferredWeekdays: modulePlan.preferredWeekdays ?? null,
      }}
      hasGoals={goals.length > 0}
      hasExamGoal={hasExamGoal}
      hasOutline={outlineTopicCount > 0}
      goals={goals.map((g) => ({ id: g.id, type: g.type, title: g.title }))}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
        dueDate: t.dueDate,
        goalId: t.goalId,
        done: t.done,
        scheduled: t.sessionId != null,
        aiGenerated: t.aiGenerated,
      }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        durationMinutes: s.durationMinutes,
        done: s.done,
        taskCount: s.tasks.length,
      }))}
      setupSteps={setupSteps}
    />
  )
}
