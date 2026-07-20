"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { writingProject } from "@/db/schema"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { ownProgram } from "@/lib/studies/access"
import {
  getLanguageModel,
  resolveModelForUser,
  userHasUsableKeyForModel,
} from "@/lib/ai/registry"
import { GEN_PARAMS, maxTokensForItems } from "@/lib/ai/params"
import { assertAiAllowed } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { brainstormSchema, buildBrainstormPrompt } from "@/lib/writing/ai"

async function ownThesis(thesisId: string, userId: string) {
  const row = await db.query.writingProject.findFirst({
    where: and(eq(writingProject.id, thesisId), eq(writingProject.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

async function getModel(userId: string) {
  const defaultModel = await resolveModelForUser(userId)
  if (!defaultModel) actionError("AI_NO_MODEL")
  // BYOK dead-end: model configured but no usable key for its provider (F4).
  if (!(await userHasUsableKeyForModel(defaultModel, userId))) actionError("AI_SETUP_REQUIRED")
  return { ref: defaultModel, model: await getLanguageModel(defaultModel, userId) }
}

// ---- CRUD ---------------------------------------------------------------------

const thesisSchema = z.object({
  title: z.string().min(1).max(400),
  thesisType: z.string().max(50).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  semesterId: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
})

async function assertOwnSemester(semesterId: string, userId: string) {
  const row = await db.query.semester.findFirst({
    where: (s, { eq }) => eq(s.id, semesterId),
    with: { program: true },
  })
  if (!row || row.program.userId !== userId) throw new Error("Not found")
}

export async function createThesis(input: unknown) {
  const session = await requireSession()
  const data = thesisSchema.parse(input)
  if (data.semesterId) await assertOwnSemester(data.semesterId, session.user.id)
  if (data.programId) await ownProgram(data.programId, session.user.id)

  // One active (non-superseded) thesis per program.
  if (data.programId) {
    const existing = await db.query.writingProject.findFirst({
      where: and(
        eq(writingProject.userId, session.user.id),
        eq(writingProject.programId, data.programId),
        isNull(writingProject.supersededById)
      ),
      columns: { id: true },
    })
    if (existing) {
      actionError("THESIS_ACTIVE_EXISTS")
    }
  }

  const [created] = await db
    .insert(writingProject)
    .values({
      userId: session.user.id,
      title: data.title,
      thesisType: data.thesisType ?? null,
      dueDate: data.dueDate ?? null,
      semesterId: data.semesterId ?? null,
      programId: data.programId ?? null,
    })
    .returning({ id: writingProject.id })
  revalidatePath("/thesis")
  return { ok: true as const, id: created.id }
}

/** Marks a failed thesis as superseded and starts a fresh attempt (new topic). */
export async function retryThesis(thesisId: string) {
  const session = await requireSession()
  const prev = await ownThesis(thesisId, session.user.id)
  if (prev.supersededById) throw new Error("Not found")
  if (prev.programId) {
    const program = await ownProgram(prev.programId, session.user.id)
    if (prev.attempt >= program.thesisMaxAttempts) {
      actionError("THESIS_MAX_ATTEMPTS")
    }
  }

  // `thesis_active_per_program_uq` is a partial unique index over
  // (userId, programId) where `supersededById is null and programId is not
  // null`. Partial indexes aren't deferrable, so it's checked per-statement:
  // inserting the new attempt with `programId` set while the old row is still
  // live would momentarily leave TWO live rows for the program → violation.
  // Order the writes inside a transaction so the predicate never matches two
  // rows at once: (1) insert the new attempt WITHOUT programId (predicate
  // false), (2) supersede the old row (it drops out of the predicate),
  // (3) attach programId to the new row (now the only live row for the program).
  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(writingProject)
      .values({
        userId: session.user.id,
        title: prev.title,
        thesisType: prev.thesisType,
        programId: null,
        goalId: prev.goalId,
        semesterId: prev.semesterId,
        attempt: prev.attempt + 1,
        phase: "topic",
      })
      .returning({ id: writingProject.id })
    await tx
      .update(writingProject)
      .set({ supersededById: created.id })
      .where(eq(writingProject.id, thesisId))
    if (prev.programId) {
      await tx
        .update(writingProject)
        .set({ programId: prev.programId })
        .where(eq(writingProject.id, created.id))
    }
    return created.id
  })
  revalidatePath("/thesis")
  return { ok: true as const, id: newId }
}

const thesisUpdateSchema = thesisSchema.partial().extend({
  phase: z.enum(["topic", "exposé", "research", "writing", "revision", "submitted"]).optional(),
  researchQuestion: z.string().max(2000).optional().nullable(),
  outline: z.string().max(20000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
})

export async function updateThesis(thesisId: string, input: unknown) {
  const session = await requireSession()
  await ownThesis(thesisId, session.user.id)
  const data = thesisUpdateSchema.parse(input)
  if (data.semesterId) await assertOwnSemester(data.semesterId, session.user.id)
  await db.update(writingProject).set(data).where(eq(writingProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function deleteThesis(thesisId: string) {
  const session = await requireSession()
  await ownThesis(thesisId, session.user.id)
  await db.delete(writingProject).where(eq(writingProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

// ---- AI workflows -----------------------------------------------------------------

export async function brainstormTopics(interests: string) {
  const session = await requireSession()
  await assertAiAllowed(session.user.id)
  const { ref, model } = await getModel(session.user.id)
  const { object } = await runAi(
    { userId: session.user.id, model: ref, feature: "thesis-topics", entityType: "thesis" },
    () =>
      generateObject({
        model,
        schema: brainstormSchema,
        prompt: buildBrainstormPrompt(interests),
        ...GEN_PARAMS,
        maxOutputTokens: maxTokensForItems(8),
      })
  )
  return object.topics
}
