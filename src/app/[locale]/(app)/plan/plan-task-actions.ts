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
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { buildTaskDrafts, sourceKey, type TaskGenInput } from "@/lib/plan/tasks"
import { dueDateField } from "@/lib/plan/task-validation"
import { markPlanStale } from "@/lib/plan/staleness"
import { toIsoDate } from "@/lib/events/recurrence"

type OwnedModule = Awaited<ReturnType<typeof ownModule>>

function revalidateModule(mod: OwnedModule) {
  revalidatePath(`/studies/${mod.semester.programId}/${mod.id}/plan`)
  revalidatePath(`/plan/${mod.semesterId}`)
  revalidatePath("/", "layout")
}

/** A2: flag the module's semester plan stale after a plan-relevant mutation. */
async function markStale(mod: OwnedModule) {
  await markPlanStale(mod.semesterId)
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
  if (!goals.some((g) => g.id === goalId)) actionError("PLAN_INVALID_GOAL")
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
  // insert().returning() yields exactly one row unless it throws.
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
  await markStale(mod)
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
  const today = toIsoDate(new Date())
  const drafts = buildTaskDrafts(genInput, today)

  await ensureModulePlan(moduleId)

  const existing = await db.query.planTask.findMany({
    where: eq(planTask.moduleId, moduleId),
    columns: {
      id: true,
      source: true,
      sortOrder: true,
      dueDate: true,
      estimatedMinutes: true,
      done: true,
    },
  })
  const existingKeys = new Set(existing.map((t) => sourceKey(t.source)))
  const draftByKey = new Map(drafts.map((d) => [sourceKey(d.source), d]))
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), -1)

  // A12 reconciliation: keep the generated task set in sync with the current
  // draft set. Never touch manual tasks or anything already done.
  const toDelete: string[] = []
  const toUpdate: { id: string; dueDate: string | null; estimatedMinutes: number }[] = []
  for (const t of existing) {
    if (t.source.kind === "manual" || t.done) continue
    const draft = draftByKey.get(sourceKey(t.source))
    if (!draft) {
      toDelete.push(t.id) // generated task whose source vanished from the drafts
      continue
    }
    if (t.dueDate !== draft.dueDate || t.estimatedMinutes !== draft.estimatedMinutes) {
      toUpdate.push({ id: t.id, dueDate: draft.dueDate, estimatedMinutes: draft.estimatedMinutes })
    }
  }

  const toInsert = drafts.filter((d) => !existingKeys.has(sourceKey(d.source)))

  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.delete(planTask).where(inArray(planTask.id, toDelete))
    }
    for (const u of toUpdate) {
      await tx
        .update(planTask)
        .set({ dueDate: u.dueDate, estimatedMinutes: u.estimatedMinutes })
        .where(eq(planTask.id, u.id))
    }
    if (toInsert.length > 0) {
      await tx.insert(planTask).values(
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
  })

  await markStale(mod)
  revalidateModule(mod)
  return {
    ok: true as const,
    created: toInsert.length,
    deleted: toDelete.length,
    updated: toUpdate.length,
  }
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
  // insert().returning() yields exactly one row unless it throws.
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
  await markStale(mod)
  revalidateModule(mod)
  return { ok: true as const, id: created!.id }
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
  await markStale(row.module)
  revalidateModule(row.module)
  return { ok: true as const }
}

export async function togglePlanTask(taskId: string, done: boolean) {
  const session = await requireSession()
  const row = await ownPlanTask(taskId, session.user.id)
  await db.update(planTask).set({ done }).where(eq(planTask.id, taskId))
  await markStale(row.module)
  revalidateModule(row.module)
  return { ok: true as const }
}

export async function deletePlanTask(taskId: string) {
  const session = await requireSession()
  const row = await ownPlanTask(taskId, session.user.id)
  await db.delete(planTask).where(eq(planTask.id, taskId))
  await markStale(row.module)
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
    for (const [i, id] of ids.entries()) {
      if (!ownedIds.has(id)) continue
      await tx.update(planTask).set({ sortOrder: i }).where(eq(planTask.id, id))
    }
  })
  await markStale(mod)
  revalidateModule(mod)
  return { ok: true as const }
}
