"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { studyPlan, studyPlanItem } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { searchChunks } from "@/lib/ai/rag"
import { assertWithinLimit } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { ownModule } from "@/lib/studies/access"

async function ownModuleOrNull(moduleId: string | null | undefined, userId: string) {
  if (moduleId) await ownModule(moduleId, userId)
  return moduleId || null
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
  revalidatePath("/")
  return { ok: true as const, id: created.id }
}

export async function updatePlan(planId: string, input: unknown) {
  const session = await requireSession()
  await ownPlan(planId, session.user.id)
  const data = planSchema.pick({ title: true, description: true }).parse(input)
  await db
    .update(studyPlan)
    .set({ title: data.title, description: data.description ?? null })
    .where(and(eq(studyPlan.id, planId), eq(studyPlan.userId, session.user.id)))
  revalidatePath("/")
  return { ok: true as const }
}

export async function deletePlan(planId: string) {
  const session = await requireSession()
  await db
    .delete(studyPlan)
    .where(and(eq(studyPlan.id, planId), eq(studyPlan.userId, session.user.id)))
  revalidatePath("/")
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
  revalidatePath("/")
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
  revalidatePath("/")
  return { ok: true as const }
}

export async function updatePlanItem(itemId: string, input: unknown) {
  const session = await requireSession()
  const item = await db.query.studyPlanItem.findFirst({
    where: eq(studyPlanItem.id, itemId),
    with: { plan: true },
  })
  if (!item || item.plan.userId !== session.user.id) throw new Error("Not found")
  const data = planItemSchema.parse(input)
  await db
    .update(studyPlanItem)
    .set({
      title: data.title,
      description: data.description ?? null,
      scheduledDate: data.scheduledDate ?? null,
      durationMinutes: data.durationMinutes ?? null,
    })
    .where(eq(studyPlanItem.id, itemId))
  revalidatePath("/")
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
  revalidatePath("/")
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

// ---- Study sessions (Pomodoro) ---------------------------------------------------

const studySessionSchema = z.object({
  moduleId: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).max(600),
  kind: z.enum(["pomodoro", "manual", "cards", "quiz"]).default("pomodoro"),
})

export async function logStudySession(input: unknown) {
  const session = await requireSession()
  const data = studySessionSchema.parse(input)
  await ownModuleOrNull(data.moduleId, session.user.id)
  const { studySession } = await import("@/db/schema")
  await db.insert(studySession).values({
    userId: session.user.id,
    moduleId: data.moduleId || null,
    durationMinutes: data.durationMinutes,
    kind: data.kind,
  })
  revalidatePath("/")
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

  const defaultModel = await resolveModelForUser(session.user.id)
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
  const { object } = await runAi(
    {
      userId: session.user.id,
      model: defaultModel,
      feature: "study-plan",
      moduleId: data.moduleId ?? null,
      entityType: "plan",
    },
    () =>
      generateObject({
        model,
        schema: generatedPlanSchema,
        prompt: `Create a realistic study plan for a university student.
Today is ${today}. The exam is on ${data.examDate}.
Available study time: ${data.hoursPerWeek} hours per week.
Topics to cover: ${data.topics}${materialContext}

Create study sessions distributed between today and the exam date (include buffer and revision sessions near the end). Each session gets a concrete topic, a short description of what to do, a scheduledDate (YYYY-MM-DD, between today and the exam) and a realistic durationMinutes. Write in the same language as the topics description.`,
      })
  )

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
        scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(item.scheduledDate) ? item.scheduledDate : null,
        durationMinutes: item.durationMinutes,
        sortOrder: i,
      }))
    )
  }

  revalidatePath("/")
  return { ok: true as const, id: created.id }
}

// ---- AI progress analysis --------------------------------------------------------

/**
 * Analyzes the user's full learning history for a module (quiz attempts,
 * flashcard reviews, study time) and returns a Markdown recommendation of what
 * to deepen — explicitly noting improvements over time.
 */
export async function analyzeProgress(moduleId: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  await ownModule(moduleId, session.user.id)

  const { generateText } = await import("ai")
  const { quiz, flashcard, deck, studySession } = await import("@/db/schema")
  const { desc, gte, sql: dsql } = await import("drizzle-orm")

  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)

  const [quizzes, problemCards, sessions] = await Promise.all([
    db.query.quiz.findMany({
      where: and(eq(quiz.userId, session.user.id), eq(quiz.moduleId, moduleId)),
      with: {
        attempts: {
          orderBy: (a) => [desc(a.startedAt)],
          limit: 10,
          with: { answers: { with: { question: { columns: { prompt: true } } } } },
        },
      },
    }),
    db
      .select({
        front: flashcard.front,
        lapses: flashcard.lapses,
        reps: flashcard.reps,
      })
      .from(flashcard)
      .innerJoin(deck, eq(flashcard.deckId, deck.id))
      .where(and(eq(deck.userId, session.user.id), eq(deck.moduleId, moduleId)))
      .orderBy(desc(flashcard.lapses))
      .limit(15),
    db.query.studySession.findMany({
      where: and(
        eq(studySession.userId, session.user.id),
        eq(studySession.moduleId, moduleId),
        gte(studySession.startedAt, since)
      ),
      orderBy: (s) => [desc(s.startedAt)],
      limit: 50,
    }),
  ])
  void dsql

  const data = {
    quizzes: quizzes.map((q) => ({
      title: q.title,
      attempts: q.attempts
        .filter((a) => a.finishedAt)
        .map((a) => ({
          date: a.startedAt.toISOString().slice(0, 10),
          score: Number(a.score ?? 0),
          wrongQuestions: a.answers
            .filter((ans) => ans.correct === false)
            .map((ans) => ans.question.prompt.slice(0, 120)),
        })),
    })),
    problemFlashcards: problemCards
      .filter((c) => c.lapses > 0)
      .map((c) => ({ front: c.front.slice(0, 120), lapses: c.lapses, reps: c.reps })),
    studySessions: sessions.map((s) => ({
      date: s.startedAt.toISOString().slice(0, 10),
      minutes: s.durationMinutes,
      kind: s.kind,
    })),
  }

  const defaultModel = await resolveModelForUser(session.user.id)
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const { text } = await runAi(
    {
      userId: session.user.id,
      model: defaultModel,
      feature: "analysis",
      moduleId,
      entityType: "module",
      entityId: moduleId,
    },
    () =>
      generateText({
        model,
        prompt: `You are a study coach. Analyze this learning history for one university module and tell the student what to deepen next.
Requirements:
- Answer in the language of the quiz/flashcard content (German if mixed).
- Look at trends ACROSS attempts over time: explicitly mention topics where the student has already improved, and topics that keep going wrong.
- Recommend 2-4 concrete focus areas with a short reason each.
- Keep it under 250 words, use Markdown with a short bullet list.

Data (JSON): ${JSON.stringify(data).slice(0, 20000)}`,
      })
  )

  return { ok: true as const, analysis: text }
}
