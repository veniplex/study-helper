"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { studyEvent, thesisMilestone, thesisProject } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownProgram } from "@/lib/studies/access"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"

async function ownThesis(thesisId: string, userId: string) {
  const row = await db.query.thesisProject.findFirst({
    where: and(eq(thesisProject.id, thesisId), eq(thesisProject.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

async function getModel(userId: string) {
  const defaultModel = await resolveModelForUser(userId)
  if (!defaultModel) throw new Error("No AI model configured")
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
    const existing = await db.query.thesisProject.findFirst({
      where: and(
        eq(thesisProject.userId, session.user.id),
        eq(thesisProject.programId, data.programId),
        isNull(thesisProject.supersededById)
      ),
      columns: { id: true },
    })
    if (existing) {
      throw new Error("Für diesen Studiengang existiert bereits eine aktive Abschlussarbeit.")
    }
  }

  const [created] = await db
    .insert(thesisProject)
    .values({
      userId: session.user.id,
      title: data.title,
      thesisType: data.thesisType ?? null,
      dueDate: data.dueDate ?? null,
      semesterId: data.semesterId ?? null,
      programId: data.programId ?? null,
    })
    .returning({ id: thesisProject.id })
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
      throw new Error("Maximale Versuchszahl für die Abschlussarbeit erreicht.")
    }
  }

  const [created] = await db
    .insert(thesisProject)
    .values({
      userId: session.user.id,
      title: prev.title,
      thesisType: prev.thesisType,
      programId: prev.programId,
      semesterId: prev.semesterId,
      attempt: prev.attempt + 1,
      phase: "topic",
    })
    .returning({ id: thesisProject.id })
  await db
    .update(thesisProject)
    .set({ supersededById: created.id })
    .where(eq(thesisProject.id, thesisId))
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
  await db.update(thesisProject).set(data).where(eq(thesisProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function deleteThesis(thesisId: string) {
  const session = await requireSession()
  await ownThesis(thesisId, session.user.id)
  await db.delete(thesisProject).where(eq(thesisProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

const milestoneSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
})

export async function addMilestone(thesisId: string, input: unknown) {
  const session = await requireSession()
  await ownThesis(thesisId, session.user.id)
  const data = milestoneSchema.parse(input)
  await db.insert(thesisMilestone).values({
    thesisId,
    title: data.title,
    description: data.description ?? null,
    dueDate: data.dueDate ?? null,
  })
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function toggleMilestone(milestoneId: string, done: boolean) {
  const session = await requireSession()
  const row = await db.query.thesisMilestone.findFirst({
    where: eq(thesisMilestone.id, milestoneId),
    with: { thesis: true },
  })
  if (!row || row.thesis.userId !== session.user.id) throw new Error("Not found")
  await db.update(thesisMilestone).set({ done }).where(eq(thesisMilestone.id, milestoneId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function updateMilestone(milestoneId: string, input: unknown) {
  const session = await requireSession()
  const row = await db.query.thesisMilestone.findFirst({
    where: eq(thesisMilestone.id, milestoneId),
    with: { thesis: true },
  })
  if (!row || row.thesis.userId !== session.user.id) throw new Error("Not found")
  const data = milestoneSchema.parse(input)
  await db
    .update(thesisMilestone)
    .set({
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
    })
    .where(eq(thesisMilestone.id, milestoneId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function deleteMilestone(milestoneId: string) {
  const session = await requireSession()
  const row = await db.query.thesisMilestone.findFirst({
    where: eq(thesisMilestone.id, milestoneId),
    with: { thesis: true },
  })
  if (!row || row.thesis.userId !== session.user.id) throw new Error("Not found")
  await db.delete(thesisMilestone).where(eq(thesisMilestone.id, milestoneId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

// ---- AI workflows -----------------------------------------------------------------

export async function brainstormTopics(interests: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const { ref, model } = await getModel(session.user.id)
  const { object, usage } = await generateObject({
    model,
    schema: z.object({
      topics: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            researchQuestion: z.string(),
          })
        )
        .max(8),
    }),
    prompt: `Suggest 5-8 concrete, feasible thesis topics based on these interests and constraints: ${interests}.
For each: a specific title, a 2-3 sentence description of scope and approach, and one possible research question. Write in the language of the input.`,
  })
  await logUsage(session.user.id, ref, "thesis-topics", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })
  return object.topics
}

export async function generateOutline(thesisId: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const thesis = await ownThesis(thesisId, session.user.id)
  const { ref, model } = await getModel(session.user.id)
  const { text, usage } = await generateText({
    model,
    prompt: `Create a detailed chapter outline (as a Markdown nested list with short notes per section) for this thesis:
Title: ${thesis.title}
Type: ${thesis.thesisType ?? "thesis"}
Research question: ${thesis.researchQuestion ?? "not defined yet"}
Notes: ${thesis.notes ?? "-"}
Write in the language of the title.`,
  })
  await logUsage(session.user.id, ref, "thesis-outline", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })
  await db.update(thesisProject).set({ outline: text }).where(eq(thesisProject.id, thesisId))
  revalidatePath("/thesis")
  return { ok: true as const }
}

export async function generateMilestones(thesisId: string, addToCalendar: boolean) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const thesis = await ownThesis(thesisId, session.user.id)
  if (!thesis.dueDate) throw new Error("Set a due date first")
  const { ref, model } = await getModel(session.user.id)
  const today = new Date().toISOString().slice(0, 10)
  const { object, usage } = await generateObject({
    model,
    schema: z.object({
      milestones: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            dueDate: z.string().describe("ISO date YYYY-MM-DD"),
          })
        )
        .max(15),
    }),
    prompt: `Create a realistic milestone plan for this thesis. Today is ${today}, submission deadline is ${thesis.dueDate}.
Title: ${thesis.title} (${thesis.thesisType ?? "thesis"})
Research question: ${thesis.researchQuestion ?? "tbd"}
Cover: literature research, exposé, methodology, data/implementation (if applicable), writing per major chapter, revision, buffer before submission. 8-12 milestones with dates between today and the deadline. Write in the language of the title.`,
  })
  await logUsage(session.user.id, ref, "thesis-milestones", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })

  const valid = object.milestones.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.dueDate))
  if (valid.length > 0) {
    await db.insert(thesisMilestone).values(
      valid.map((m) => ({
        thesisId,
        title: m.title,
        description: m.description,
        dueDate: m.dueDate,
      }))
    )
    if (addToCalendar) {
      await db.insert(studyEvent).values(
        valid.map((m) => ({
          userId: session.user.id,
          type: "deadline" as const,
          title: `${thesis.title}: ${m.title}`,
          startsAt: new Date(`${m.dueDate}T09:00:00`),
          reminderOffsets: [1440],
        }))
      )
    }
  }
  revalidatePath("/thesis")
  return { ok: true as const, count: valid.length }
}
