"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { learningGoal, studyPlan, studyPlanItem, studyTask } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, listAvailableModels } from "@/lib/ai/registry"
import { searchChunks } from "@/lib/ai/rag"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { ownModule } from "@/lib/studies/access"

async function ownModuleOrNull(moduleId: string | null | undefined, userId: string) {
  if (moduleId) await ownModule(moduleId, userId)
  return moduleId || null
}

// ---- Tasks -------------------------------------------------------------------

const taskSchema = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.string().date().optional().nullable(),
  moduleId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
})

export async function createTask(input: unknown) {
  const session = await requireSession()
  const data = taskSchema.parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)
  await db.insert(studyTask).values({
    userId: session.user.id,
    title: data.title,
    notes: data.notes ?? null,
    priority: data.priority,
    dueDate: data.dueDate ?? null,
    moduleId: data.moduleId || null,
    parentId: data.parentId || null,
  })
  revalidatePath("/learn")
  return { ok: true as const }
}

export async function updateTask(taskId: string, input: unknown) {
  const session = await requireSession()
  const data = taskSchema.partial().parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)
  await db
    .update(studyTask)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      ...(data.moduleId !== undefined ? { moduleId: data.moduleId || null } : {}),
    })
    .where(and(eq(studyTask.id, taskId), eq(studyTask.userId, session.user.id)))
  revalidatePath("/learn")
  return { ok: true as const }
}

export async function toggleTask(taskId: string, done: boolean) {
  const session = await requireSession()
  await db
    .update(studyTask)
    .set({ status: done ? "done" : "open", completedAt: done ? new Date() : null })
    .where(and(eq(studyTask.id, taskId), eq(studyTask.userId, session.user.id)))
  revalidatePath("/learn")
  return { ok: true as const }
}

export async function updateTaskStatus(taskId: string, status: unknown) {
  const session = await requireSession()
  const value = z.enum(["open", "doing", "done"]).parse(status)
  await db
    .update(studyTask)
    .set({ status: value, completedAt: value === "done" ? new Date() : null })
    .where(and(eq(studyTask.id, taskId), eq(studyTask.userId, session.user.id)))
  return { ok: true as const }
}

export async function reorderTasks(ids: unknown) {
  const session = await requireSession()
  const list = z.array(z.string()).max(500).parse(ids)
  await Promise.all(
    list.map((id, i) =>
      db
        .update(studyTask)
        .set({ sortOrder: i })
        .where(and(eq(studyTask.id, id), eq(studyTask.userId, session.user.id)))
    )
  )
  return { ok: true as const }
}

export async function deleteTask(taskId: string) {
  const session = await requireSession()
  await db
    .delete(studyTask)
    .where(and(eq(studyTask.id, taskId), eq(studyTask.userId, session.user.id)))
  revalidatePath("/learn")
  return { ok: true as const }
}

// ---- Goals -------------------------------------------------------------------

const goalSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  targetDate: z.string().date().optional().nullable(),
  moduleId: z.string().optional().nullable(),
})

export async function createGoal(input: unknown) {
  const session = await requireSession()
  const data = goalSchema.parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)
  await db.insert(learningGoal).values({
    userId: session.user.id,
    title: data.title,
    description: data.description ?? null,
    targetDate: data.targetDate ?? null,
    moduleId: data.moduleId || null,
  })
  revalidatePath("/learn/goals")
  return { ok: true as const }
}

export async function updateGoalProgress(goalId: string, progress: number) {
  const session = await requireSession()
  const value = Math.max(0, Math.min(100, Math.round(progress)))
  await db
    .update(learningGoal)
    .set({ progress: value })
    .where(and(eq(learningGoal.id, goalId), eq(learningGoal.userId, session.user.id)))
  revalidatePath("/learn/goals")
  return { ok: true as const }
}

export async function deleteGoal(goalId: string) {
  const session = await requireSession()
  await db
    .delete(learningGoal)
    .where(and(eq(learningGoal.id, goalId), eq(learningGoal.userId, session.user.id)))
  revalidatePath("/learn/goals")
  return { ok: true as const }
}

// ---- Study plans ----------------------------------------------------------------

const planSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  moduleId: z.string().optional().nullable(),
})

export async function createPlan(input: unknown) {
  const session = await requireSession()
  const data = planSchema.parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)
  const [created] = await db
    .insert(studyPlan)
    .values({
      userId: session.user.id,
      title: data.title,
      description: data.description ?? null,
      moduleId: data.moduleId || null,
    })
    .returning({ id: studyPlan.id })
  revalidatePath("/learn/plans")
  return { ok: true as const, id: created.id }
}

export async function deletePlan(planId: string) {
  const session = await requireSession()
  await db
    .delete(studyPlan)
    .where(and(eq(studyPlan.id, planId), eq(studyPlan.userId, session.user.id)))
  revalidatePath("/learn/plans")
  return { ok: true as const }
}

const planItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  scheduledDate: z.string().date().optional().nullable(),
  durationMinutes: z.number().int().min(5).max(600).optional().nullable(),
})

async function ownPlan(planId: string, userId: string) {
  const plan = await db.query.studyPlan.findFirst({
    where: and(eq(studyPlan.id, planId), eq(studyPlan.userId, userId)),
  })
  if (!plan) throw new Error("Not found")
  return plan
}

export async function addPlanItem(planId: string, input: unknown) {
  const session = await requireSession()
  await ownPlan(planId, session.user.id)
  const data = planItemSchema.parse(input)
  await db.insert(studyPlanItem).values({
    planId,
    title: data.title,
    description: data.description ?? null,
    scheduledDate: data.scheduledDate ?? null,
    durationMinutes: data.durationMinutes ?? null,
  })
  revalidatePath(`/learn/plans/${planId}`)
  return { ok: true as const }
}

export async function togglePlanItem(itemId: string, done: boolean) {
  const session = await requireSession()
  const item = await db.query.studyPlanItem.findFirst({
    where: eq(studyPlanItem.id, itemId),
    with: { plan: true },
  })
  if (!item || item.plan.userId !== session.user.id) throw new Error("Not found")
  await db.update(studyPlanItem).set({ done }).where(eq(studyPlanItem.id, itemId))
  revalidatePath(`/learn/plans/${item.planId}`)
  return { ok: true as const }
}

export async function deletePlanItem(itemId: string) {
  const session = await requireSession()
  const item = await db.query.studyPlanItem.findFirst({
    where: eq(studyPlanItem.id, itemId),
    with: { plan: true },
  })
  if (!item || item.plan.userId !== session.user.id) throw new Error("Not found")
  await db.delete(studyPlanItem).where(eq(studyPlanItem.id, itemId))
  revalidatePath(`/learn/plans/${item.planId}`)
  return { ok: true as const }
}

export async function reorderPlanItems(planId: string, ids: unknown) {
  const session = await requireSession()
  await ownPlan(planId, session.user.id)
  const list = z.array(z.string()).max(500).parse(ids)
  await Promise.all(
    list.map((id, i) =>
      db
        .update(studyPlanItem)
        .set({ sortOrder: i })
        .where(and(eq(studyPlanItem.id, id), eq(studyPlanItem.planId, planId)))
    )
  )
  return { ok: true as const }
}

// ---- AI study plan generation ---------------------------------------------------

const generatePlanInputSchema = z.object({
  moduleId: z.string().optional().nullable(),
  examDate: z.string().date(),
  hoursPerWeek: z.number().min(1).max(80),
  topics: z.string().max(4000),
  useMaterials: z.boolean().default(true),
})

const generatedPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  items: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        scheduledDate: z.string().describe("ISO date YYYY-MM-DD"),
        durationMinutes: z.number().int(),
      })
    )
    .max(60),
})

export async function generateStudyPlan(input: unknown) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const data = generatePlanInputSchema.parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)

  const { defaultModel } = await listAvailableModels()
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  let materialContext = ""
  if (data.useMaterials && data.topics) {
    const hits = await searchChunks(session.user.id, data.topics, {
      moduleId: data.moduleId,
      limit: 4,
    })
    if (hits.length > 0) {
      materialContext =
        "\n\nExcerpts from the user's study materials:\n" +
        hits.map((h) => `[${h.materialName}] ${h.content.slice(0, 800)}`).join("\n---\n")
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const { object, usage } = await generateObject({
    model,
    schema: generatedPlanSchema,
    prompt: `Create a realistic study plan for a university student.
Today is ${today}. The exam is on ${data.examDate}.
Available study time: ${data.hoursPerWeek} hours per week.
Topics to cover: ${data.topics}${materialContext}

Create study sessions distributed between today and the exam date (include buffer and revision sessions near the end). Each session gets a concrete topic, a short description of what to do, a scheduledDate (YYYY-MM-DD, between today and the exam) and a realistic durationMinutes. Write in the same language as the topics description.`,
  })

  await logUsage(session.user.id, defaultModel, "study-plan", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })

  const [created] = await db
    .insert(studyPlan)
    .values({
      userId: session.user.id,
      moduleId: data.moduleId || null,
      title: object.title,
      description: object.description,
      aiGenerated: true,
    })
    .returning({ id: studyPlan.id })

  if (object.items.length > 0) {
    await db.insert(studyPlanItem).values(
      object.items.map((item, i) => ({
        planId: created.id,
        title: item.title,
        description: item.description,
        scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate)
          ? item.scheduledDate
          : null,
        durationMinutes: item.durationMinutes,
        sortOrder: i,
      }))
    )
  }

  revalidatePath("/learn/plans")
  return { ok: true as const, id: created.id }
}
