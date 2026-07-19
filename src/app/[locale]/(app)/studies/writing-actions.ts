"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { moduleGoal, studyEvent, writingMilestone, writingProject } from "@/db/schema"
import type { GoalType } from "@/db/schema/studies"
import type { WritingPhase } from "@/db/schema/thesis"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { assertWithinLimit } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { searchChunks } from "@/lib/ai/rag"
import { isValidPhase, phasesFor } from "@/lib/writing/phases"
import {
  buildMilestonesPrompt,
  buildOutlinePrompt,
  buildSourcesPrompt,
  milestonesSchema,
  sourcesSchema,
  type WritingPromptFields,
} from "@/lib/writing/ai"

/** Goal types that own a writing project, in resolution priority order. */
const WRITING_GOAL_TYPES: readonly GoalType[] = ["thesis", "term_paper", "project"]

async function getModel(userId: string) {
  const defaultModel = await resolveModelForUser(userId)
  if (!defaultModel) actionError("AI_NO_MODEL")
  return { ref: defaultModel, model: await getLanguageModel(defaultModel, userId) }
}

/** Loads a writing project (with its goal → module → semester) or throws. */
async function ownWriting(projectId: string, userId: string) {
  const row = await db.query.writingProject.findFirst({
    where: and(eq(writingProject.id, projectId), eq(writingProject.userId, userId)),
    with: { goal: { with: { module: { with: { semester: true } } } } },
  })
  if (!row) throw new Error("Not found")
  return row
}

type OwnedWriting = Awaited<ReturnType<typeof ownWriting>>

/**
 * Revalidates every surface a writing project appears on: `/thesis` (program
 * thesis) and — when the project is linked to a module goal — that module's
 * paper tab. A thesis-kind project bound to a module is reachable on both.
 */
function revalidateWriting(row: OwnedWriting) {
  revalidatePath("/thesis")
  const mod = row.goal?.module
  if (mod) revalidatePath(`/studies/${mod.semester.programId}/${mod.id}/paper`)
}

/** The subset of fields the AI prompt builders read. */
function promptFields(row: OwnedWriting): WritingPromptFields {
  return {
    title: row.title,
    thesisType: row.thesisType,
    variant: row.variant,
    researchQuestion: row.researchQuestion,
    taskDescription: row.taskDescription,
    notes: row.notes,
    dueDate: row.dueDate,
  }
}

async function assertOwnSemester(semesterId: string, userId: string) {
  const row = await db.query.semester.findFirst({
    where: (s, { eq: e }) => e(s.id, semesterId),
    with: { program: true },
  })
  if (!row || row.program.userId !== userId) throw new Error("Not found")
}

// ---- Get-or-create ----------------------------------------------------------

/**
 * Resolves (or lazily creates) the writing project for a module's writing goal.
 * Goal priority: thesis → term_paper → project. A thesis goal produces a
 * scientific, program-bound (`programId` + `goalId`) thesis-kind row — the SAME
 * row `/thesis` shows; a term_paper/project goal produces a goal-bound
 * (`goalId` only) row whose variant/taskDescription come from the goal config.
 */
export async function ensureModuleWritingProject(moduleId: string) {
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const goals = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
  })
  const goal = WRITING_GOAL_TYPES.map((type) => goals.find((g) => g.type === type)).find(
    (g): g is (typeof goals)[number] => Boolean(g)
  )
  if (!goal) {
    actionError("WRITING_NO_GOAL")
  }

  const existing = await db.query.writingProject.findFirst({
    where: and(eq(writingProject.goalId, goal.id), isNull(writingProject.supersededById)),
    columns: { id: true },
  })
  if (existing) return existing.id

  const isThesis = goal.type === "thesis"

  // A program thesis may already exist (created on /thesis) without a goal link.
  // Reuse and link it instead of creating a duplicate (would also violate the
  // one-live-thesis-per-program unique index).
  if (isThesis) {
    const liveThesis = await db.query.writingProject.findFirst({
      where: and(
        eq(writingProject.userId, session.user.id),
        eq(writingProject.programId, mod.semester.programId),
        eq(writingProject.kind, "thesis"),
        isNull(writingProject.supersededById)
      ),
      columns: { id: true },
    })
    if (liveThesis) {
      await db
        .update(writingProject)
        .set({ goalId: goal.id })
        .where(eq(writingProject.id, liveThesis.id))
      return liveThesis.id
    }
  }

  const variant = isThesis ? "scientific" : goal.config.variant ?? "scientific"
  // Concurrent first-touches of the same goal would both pass the `existing`
  // check above and double-insert, tripping `writing_active_per_goal_uq` (or the
  // thesis-per-program index). `onConflictDoNothing` makes the loser a no-op; we
  // then re-select the row the winner created and return that.
  const [created] = await db
    .insert(writingProject)
    .values({
      userId: session.user.id,
      title: goal.title || mod.name,
      goalId: goal.id,
      kind: isThesis ? "thesis" : "term_paper",
      variant,
      phase: phasesFor(variant)[0],
      taskDescription: isThesis ? null : goal.config.taskDescription ?? null,
      programId: isThesis ? mod.semester.programId : null,
      semesterId: mod.semesterId,
      dueDate: goal.dueDate ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: writingProject.id })
  if (created) {
    revalidateWriting(await ownWriting(created.id, session.user.id))
    return created.id
  }

  // Lost the race — the live row already exists. Both code paths set
  // `goalId = goal.id`, so re-selecting the live row by goal resolves either a
  // term-paper or a thesis conflict.
  const raced = await db.query.writingProject.findFirst({
    where: and(eq(writingProject.goalId, goal.id), isNull(writingProject.supersededById)),
    columns: { id: true },
  })
  if (raced) return raced.id
  // Thesis conflict where the winning row hasn't been goal-linked yet: fall back
  // to the program-scoped live thesis and link it.
  if (isThesis) {
    const liveThesis = await db.query.writingProject.findFirst({
      where: and(
        eq(writingProject.userId, session.user.id),
        eq(writingProject.programId, mod.semester.programId),
        eq(writingProject.kind, "thesis"),
        isNull(writingProject.supersededById)
      ),
      columns: { id: true },
    })
    if (liveThesis) {
      await db
        .update(writingProject)
        .set({ goalId: goal.id })
        .where(eq(writingProject.id, liveThesis.id))
      return liveThesis.id
    }
  }
  throw new Error("Not found")
}

// ---- Project CRUD -----------------------------------------------------------

const updateSchema = z.object({
  title: z.string().min(1).max(400).optional(),
  thesisType: z.string().max(50).optional().nullable(),
  phase: z.string().max(30).optional(),
  researchQuestion: z.string().max(2000).optional().nullable(),
  taskDescription: z.string().max(5000).optional().nullable(),
  outline: z.string().max(20000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  semesterId: z.string().optional().nullable(),
})

export async function updateWritingProject(projectId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownWriting(projectId, session.user.id)
  const data = updateSchema.parse(input)
  if (data.phase !== undefined && !isValidPhase(row.variant, data.phase)) {
    throw new Error("Invalid phase for this project")
  }
  if (data.semesterId) await assertOwnSemester(data.semesterId, session.user.id)
  await db
    .update(writingProject)
    .set({ ...data, phase: data.phase as WritingPhase | undefined })
    .where(eq(writingProject.id, projectId))
  revalidateWriting(row)
  return { ok: true as const }
}

export async function deleteWritingProject(projectId: string) {
  const session = await requireSession()
  const row = await ownWriting(projectId, session.user.id)
  await db.delete(writingProject).where(eq(writingProject.id, projectId))
  revalidateWriting(row)
  return { ok: true as const }
}

// ---- Milestones -------------------------------------------------------------

const milestoneSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
})

/** Loads a milestone (with its project → goal → module → semester) or throws. */
async function ownMilestone(milestoneId: string, userId: string) {
  const row = await db.query.writingMilestone.findFirst({
    where: eq(writingMilestone.id, milestoneId),
    with: { project: { with: { goal: { with: { module: { with: { semester: true } } } } } } },
  })
  if (!row || row.project.userId !== userId) throw new Error("Not found")
  return row
}

export async function addWritingMilestone(projectId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownWriting(projectId, session.user.id)
  const data = milestoneSchema.parse(input)
  await db.insert(writingMilestone).values({
    projectId,
    title: data.title,
    description: data.description ?? null,
    dueDate: data.dueDate ?? null,
  })
  revalidateWriting(row)
  return { ok: true as const }
}

export async function toggleWritingMilestone(milestoneId: string, done: boolean) {
  const session = await requireSession()
  const row = await ownMilestone(milestoneId, session.user.id)
  await db.update(writingMilestone).set({ done }).where(eq(writingMilestone.id, milestoneId))
  revalidateWriting(row.project)
  return { ok: true as const }
}

export async function updateWritingMilestone(milestoneId: string, input: unknown) {
  const session = await requireSession()
  const row = await ownMilestone(milestoneId, session.user.id)
  const data = milestoneSchema.parse(input)
  await db
    .update(writingMilestone)
    .set({
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
    })
    .where(eq(writingMilestone.id, milestoneId))
  revalidateWriting(row.project)
  return { ok: true as const }
}

export async function deleteWritingMilestone(milestoneId: string) {
  const session = await requireSession()
  const row = await ownMilestone(milestoneId, session.user.id)
  await db.delete(writingMilestone).where(eq(writingMilestone.id, milestoneId))
  revalidateWriting(row.project)
  return { ok: true as const }
}

// ---- AI workflows -----------------------------------------------------------

export async function generateWritingOutline(projectId: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const row = await ownWriting(projectId, session.user.id)
  const { ref, model } = await getModel(session.user.id)

  // Task-variant outlines ground on the module's material when available.
  let grounding: string | undefined
  const moduleId = row.goal?.moduleId
  if (row.variant === "task" && moduleId) {
    const hits = await searchChunks(session.user.id, row.taskDescription || row.title, {
      moduleId,
      limit: 6,
    })
    if (hits.length > 0) {
      grounding = hits
        .map((h) => `- ${h.content}`)
        .join("\n")
        .slice(0, 4000)
    }
  }

  const { text } = await runAi(
    {
      userId: session.user.id,
      model: ref,
      feature: "writing-outline",
      entityType: "writing",
      entityId: projectId,
      entityLabel: row.title,
    },
    () => generateText({ model, prompt: buildOutlinePrompt(promptFields(row), grounding) })
  )
  await db.update(writingProject).set({ outline: text }).where(eq(writingProject.id, projectId))
  revalidateWriting(row)
  return { ok: true as const }
}

export async function generateWritingMilestones(projectId: string, addToCalendar: boolean) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const row = await ownWriting(projectId, session.user.id)
  if (!row.dueDate) actionError("WRITING_NO_DUE_DATE")
  const { ref, model } = await getModel(session.user.id)
  const today = new Date().toISOString().slice(0, 10)

  const { object } = await runAi(
    {
      userId: session.user.id,
      model: ref,
      feature: "writing-milestones",
      entityType: "writing",
      entityId: projectId,
      entityLabel: row.title,
    },
    () =>
      generateObject({
        model,
        schema: milestonesSchema,
        prompt: buildMilestonesPrompt(promptFields(row), today),
      })
  )

  const valid = object.milestones.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.dueDate))
  if (valid.length > 0) {
    await db.insert(writingMilestone).values(
      valid.map((m) => ({
        projectId,
        title: m.title,
        description: m.description,
        dueDate: m.dueDate,
      }))
    )
    if (addToCalendar) {
      await db.insert(studyEvent).values(
        valid.map((m) => ({
          userId: session.user.id,
          moduleId: row.goal?.moduleId ?? null,
          type: "deadline" as const,
          title: `${row.title}: ${m.title}`,
          startsAt: new Date(`${m.dueDate}T09:00:00`),
          reminderOffsets: [1440],
        }))
      )
    }
  }
  revalidateWriting(row)
  return { ok: true as const, count: valid.length }
}

export async function suggestWritingSources(projectId: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const row = await ownWriting(projectId, session.user.id)
  const { ref, model } = await getModel(session.user.id)
  const { object } = await runAi(
    {
      userId: session.user.id,
      model: ref,
      feature: "writing-sources",
      entityType: "writing",
      entityId: projectId,
      entityLabel: row.title,
    },
    () =>
      generateObject({
        model,
        schema: sourcesSchema,
        prompt: buildSourcesPrompt(promptFields(row)),
      })
  )
  return object
}
