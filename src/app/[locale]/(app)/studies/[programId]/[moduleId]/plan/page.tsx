import { and, asc, eq, gte } from "drizzle-orm"
import { db } from "@/db"
import { moduleGoal, planSession, planTask } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { ensureModulePlan } from "@/app/[locale]/(app)/plan/plan-task-actions"
import { ModulePlanView } from "@/components/plan/module-plan-view"

export default async function ModulePlanPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)

  const modulePlan = await ensureModulePlan(moduleId)

  const today = new Date().toISOString().slice(0, 10)
  const [tasks, goals, sessions] = await Promise.all([
    db.query.planTask.findMany({
      where: eq(planTask.moduleId, moduleId),
      orderBy: [asc(planTask.sortOrder)],
    }),
    db.query.moduleGoal.findMany({
      where: eq(moduleGoal.moduleId, moduleId),
      orderBy: [asc(moduleGoal.sortOrder)],
      columns: { id: true, type: true, title: true },
    }),
    db.query.planSession.findMany({
      where: and(eq(planSession.moduleId, moduleId), gte(planSession.date, today)),
      orderBy: [asc(planSession.date), asc(planSession.startTime)],
      with: { tasks: { columns: { id: true, title: true, done: true } } },
    }),
  ])

  return (
    <ModulePlanView
      moduleId={moduleId}
      semesterId={mod.semesterId}
      prefs={{
        active: modulePlan.active,
        weight: Number(modulePlan.weight),
        weeklyHoursTarget:
          modulePlan.weeklyHoursTarget == null ? null : Number(modulePlan.weeklyHoursTarget),
        phase: modulePlan.phase,
        preferredWeekdays: modulePlan.preferredWeekdays ?? null,
      }}
      hasGoals={goals.length > 0}
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
      }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        durationMinutes: s.durationMinutes,
        done: s.done,
        taskCount: s.tasks.length,
      }))}
    />
  )
}
