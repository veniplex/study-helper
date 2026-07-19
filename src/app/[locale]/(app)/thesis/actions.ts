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
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { assertWithinLimit } from "@/lib/ai/usage"
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

  const [created] = await db
    .insert(writingProject)
    .values({
      userId: session.user.id,
      title: prev.title,
      thesisType: prev.thesisType,
      programId: prev.programId,
      goalId: prev.goalId,
      semesterId: prev.semesterId,
      attempt: prev.attempt + 1,
      phase: "topic",
    })
    .returning({ id: writingProject.id })
  await db
    .update(writingProject)
    .set({ supersededById: created.id })
    .where(eq(writingProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const, id: created.id }
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
  await assertWithinLimit(session.user.id)
  const { ref, model } = await getModel(session.user.id)
  const { object } = await runAi(
    { userId: session.user.id, model: ref, feature: "thesis-topics", entityType: "thesis" },
    () =>
      generateObject({
        model,
        schema: brainstormSchema,
        prompt: buildBrainstormPrompt(interests),
      })
  )
  return object.topics
}
