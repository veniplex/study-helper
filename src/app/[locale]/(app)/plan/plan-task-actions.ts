"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  assignment,
  moduleGoal,
  moduleOutline,
  modulePlan,
  outlineTopic,
  planTask,
  writingMilestone,
  writingProject,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { buildTaskDrafts, sourceKey, type TaskGenInput } from "@/lib/plan/tasks"
import { dueDateField } from "@/lib/plan/task-validation"

type OwnedModule = Awaited<ReturnType<typeof ownModule>>

function revalidateModule(mod: OwnedModule) {
  revalidatePath(`/studies/${mod.semester.programId}/${mod.id}/plan`)
  revalidatePath(`/plan/${mod.semesterId}`)
  revalidatePath("/", "layout")
}

/**
 * Verifies a client-supplied goalId belongs to the given (already-owned)
 * module. Mirrors the check in ai/tool-executors.ts. Rejects cross-module
 * goal references (IDOR).
 */
async function assertGoalInModule(moduleId: string, goalId: string | null | undefined) {
  if (!goalId) return
  const goals = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
    columns: { id: true },
  })
  if (!goals.some((g) => g.id === goalId)) throw new Error("Invalid goal")
}

/** Loads a plan task (with its module → semester → program) or throws. */
async function ownPlanTask(taskId: string, userId: string) {
  const row = await db.query.planTask.findFirst({
    where: eq(planTask.id, taskId),
    with: { module: { with: { semester: { with: { program: true } } } } },
  })
  if (!row || row.module.semester.program.userId !== userId) throw new Error("Not found")
  return row
}

// ---- module_plan row --------------------------------------------------------

/** Gets or lazily creates the module_plan row for a module. */
export async function ensureModulePlan(moduleId: string) {
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  const existing = await db.query.modulePlan.findFirst({
    where: eq(modulePlan.moduleId, moduleId),
  })
  if (existing) return existing
  const [created] = await db
    .insert(modulePlan)
    .values({ moduleId })
    .onConflictDoNothing({ target: modulePlan.moduleId })
    .returning()
  return created ?? (await db.query.modulePlan.findFirst({ where: eq(modulePlan.moduleId, moduleId) }))!
}

const prefsSchema = z.object({
  active: z.boolean().optional(),
  weight: z.number().min(0).max(100).optional(),
  weeklyHoursTarget: z.number().min(0).max(80).nullable().optional(),
  phase: z.number().int().min(1).max(10).optional(),
  preferredWeekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
})

export async function updateModulePlanPrefs(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = prefsSchema.parse(input)
  await ensureModulePlan(moduleId)
  await db
    .update(modulePlan)
    .set({
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.weight !== undefined ? { weight: String(data.weight) } : {}),
      ...(data.weeklyHoursTarget !== undefined
        ? { weeklyHoursTarget: data.weeklyHoursTarget == null ? null : String(data.weeklyHoursTarget) }
        : {}),
      ...(data.phase !== undefined ? { phase: data.phase } : {}),
      ...(data.preferredWeekdays !== undefined ? { preferredWeekdays: data.preferredWeekdays } : {}),
    })
    .where(eq(modulePlan.moduleId, moduleId))
  revalidateModule(mod)
  return { ok: true as const }
}

// ---- goal-based generation --------------------------------------------------

/**
 * (Re)generates plan tasks for a module from its goals + data. Idempotent:
 * drafts are keyed by their `source` (kind + refId), so re-runs insert only
 * genuinely new tasks and never touch manual or already-generated ones.
 */
export async function generateModuleTasks(moduleId: string) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)

  const goals = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
    columns: { id: true, type: true, title: true, dueDate: true, config: true },
  })
  if (goals.length === 0) return { ok: true as const, created: 0 }

  // Latest-version outline topics (if any).
  const outline = await db.query.moduleOutline.findFirst({
    where: eq(moduleOutline.moduleId, moduleId),
    columns: { version: true },
  })
  const outlineTopics = outline
    ? await db.query.outlineTopic.findMany({
        where: and(
          eq(outlineTopic.moduleId, moduleId),
          eq(outlineTopic.version, outline.version)
        ),
        orderBy: [asc(outlineTopic.sortOrder)],
        columns: { id: true, title: true, weight: true },
      })
    : []

  const openAssignments = await db.query.assignment.findMany({
    where: and(eq(assignment.moduleId, moduleId), eq(assignment.status, "open")),
    orderBy: [asc(assignment.dueDate)],
    columns: { id: true, title: true, dueDate: true },
  })

  // Open milestones of the module's live writing projects.
  const goalIds = goals.map((g) => g.id)
  const projects = goalIds.length
    ? await db.query.writingProject.findMany({
        where: and(inArray(writingProject.goalId, goalIds), isNull(writingProject.supersededById)),
        columns: { id: true },
      })
    : []
  const milestones = projects.length
    ? await db.query.writingMilestone.findMany({
        where: and(
          inArray(
            writingMilestone.projectId,
            projects.map((p) => p.id)
          ),
          eq(writingMilestone.done, false)
        ),
        orderBy: [asc(writingMilestone.dueDate)],
        columns: { id: true, title: true, description: true, dueDate: true },
      })
    : []

  const genInput: TaskGenInput = { goals, outlineTopics, assignments: openAssignments, milestones }
  const drafts = buildTaskDrafts(genInput)

  await ensureModulePlan(moduleId)

  const existing = await db.query.planTask.findMany({
    where: eq(planTask.moduleId, moduleId),
    columns: { source: true, sortOrder: true },
  })
  const existingKeys = new Set(existing.map((t) => sourceKey(t.source)))
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1)

  const toInsert = drafts.filter((d) => !existingKeys.has(sourceKey(d.source)))
  if (toInsert.length > 0) {
    await db.insert(planTask).values(
      toInsert.map((d, i) => ({
        moduleId,
        goalId: d.goalId,
        title: d.title,
        description: d.description,
        estimatedMinutes: d.estimatedMinutes,
        dueDate: d.dueDate,
        source: d.source,
        sortOrder: maxSort + 1 + i,
        aiGenerated: d.aiGenerated,
      }))
    )
  }
  revalidateModule(mod)
  return { ok: true as const, created: toInsert.length }
}

// ---- task CRUD --------------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  dueDate: dueDateField.optional().nullable(),
  goalId: z.string().optional().nullable(),
})

export async function createPlanTask(moduleId: string, input: unknown) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const data = createSchema.parse(input)
  await assertGoalInModule(moduleId, data.goalId)
  await ensureModulePlan(moduleId)
  const existing = await db.query.planTask.findMany({
    where: eq(planTask.moduleId, moduleId),
    columns: { sortOrder: true },
  })
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1)
  const [created] = await db
    .insert(planTask)
    .values({
      moduleId,
      goalId: data.goalId ?? null,
      title: data.title,
      description: data.description ?? null,
      estimatedMinutes: data.estimatedMinutes ?? 60,
      dueDate: data.dueDate ?? null,
      source: { kind: "manual" },
      sortOrder: maxSort + 1,
    })
    .returning({ id: planTask.id })
  revalidateModule(mod)
  return { ok: true as const, id: created.id }
}

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  dueDate: dueDateField.optional().nullable(),
  goalId: z.string().optional().nullable(),
})

export async function updatePlanTask(taskId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownPlanTask(taskId, session.user.id)
  const data = updateSchema.parse(input)
  if (data.goalId !== undefined) await assertGoalInModule(row.moduleId, data.goalId)
  await db
    .update(planTask)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.estimatedMinutes !== undefined ? { estimatedMinutes: data.estimatedMinutes } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      ...(data.goalId !== undefined ? { goalId: data.goalId } : {}),
    })
    .where(eq(planTask.id, taskId))
  revalidateModule(row.module)
  return { ok: true as const }
}

export async function togglePlanTask(taskId: string, done: boolean) {
  const session = await requireSession()
  const row = await ownPlanTask(taskId, session.user.id)
  await db.update(planTask).set({ done }).where(eq(planTask.id, taskId))
  revalidateModule(row.module)
  return { ok: true as const }
}

export async function deletePlanTask(taskId: string) {
  const session = await requireSession()
  const row = await ownPlanTask(taskId, session.user.id)
  await db.delete(planTask).where(eq(planTask.id, taskId))
  revalidateModule(row.module)
  return { ok: true as const }
}

export async function reorderPlanTasks(moduleId: string, orderedIds: string[]) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const ids = z.array(z.string()).max(500).parse(orderedIds)
  const owned = await db.query.planTask.findMany({
    where: and(eq(planTask.moduleId, moduleId), inArray(planTask.id, ids)),
    columns: { id: true },
  })
  const ownedIds = new Set(owned.map((t) => t.id))
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      if (!ownedIds.has(ids[i])) continue
      await tx.update(planTask).set({ sortOrder: i }).where(eq(planTask.id, ids[i]))
    }
  })
  revalidateModule(mod)
  return { ok: true as const }
}
