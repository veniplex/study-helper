"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { answerLog, question, quiz, quizAttempt } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, listAvailableModels } from "@/lib/ai/registry"
import { searchChunks } from "@/lib/ai/rag"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { ownModule } from "@/lib/studies/access"

async function ownQuiz(quizId: string, userId: string) {
  const row = await db.query.quiz.findFirst({
    where: and(eq(quiz.id, quizId), eq(quiz.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

// ---- CRUD ------------------------------------------------------------------

const quizSchema = z.object({
  title: z.string().min(1).max(300),
  moduleId: z.string().optional().nullable(),
})

export async function createQuiz(input: unknown) {
  const session = await requireSession()
  const data = quizSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  const [created] = await db
    .insert(quiz)
    .values({ userId: session.user.id, title: data.title, moduleId: data.moduleId || null })
    .returning({ id: quiz.id })
  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

export async function deleteQuiz(quizId: string) {
  const session = await requireSession()
  await db.delete(quiz).where(and(eq(quiz.id, quizId), eq(quiz.userId, session.user.id)))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const questionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("multiple_choice"),
    prompt: z.string().min(1).max(2000),
    options: z.array(z.string().min(1)).min(2).max(8),
    correctIndex: z.number().int().min(0),
    explanation: z.string().max(2000).optional().nullable(),
  }),
  z.object({
    kind: z.literal("free_text"),
    prompt: z.string().min(1).max(2000),
    referenceAnswer: z.string().min(1).max(4000),
    explanation: z.string().max(2000).optional().nullable(),
  }),
])

export async function addQuestion(quizId: string, input: unknown) {
  const session = await requireSession()
  await ownQuiz(quizId, session.user.id)
  const data = questionSchema.parse(input)
  await db.insert(question).values({
    quizId,
    kind: data.kind,
    prompt: data.prompt,
    options: data.kind === "multiple_choice" ? data.options : null,
    correctIndex: data.kind === "multiple_choice" ? data.correctIndex : null,
    referenceAnswer: data.kind === "free_text" ? data.referenceAnswer : null,
    explanation: data.explanation ?? null,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function deleteQuestion(questionId: string) {
  const session = await requireSession()
  const row = await db.query.question.findFirst({
    where: eq(question.id, questionId),
    with: { quiz: true },
  })
  if (!row || row.quiz.userId !== session.user.id) throw new Error("Not found")
  await db.delete(question).where(eq(question.id, questionId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

// ---- AI generation -----------------------------------------------------------

const generateQuizInput = z.object({
  moduleId: z.string().optional().nullable(),
  count: z.number().int().min(1).max(30),
  topics: z.string().max(2000).optional(),
  mixed: z.boolean().default(true),
})

const generatedQuizSchema = z.object({
  title: z.string(),
  questions: z
    .array(
      z.object({
        kind: z.enum(["multiple_choice", "free_text"]),
        prompt: z.string(),
        options: z.array(z.string()).describe("4 options for multiple_choice, [] for free_text"),
        correctIndex: z.number().int().describe("index of correct option, -1 for free_text"),
        referenceAnswer: z.string().describe("reference answer for free_text, empty for MC"),
        explanation: z.string(),
      })
    )
    .max(40),
})

export async function generateQuiz(input: unknown) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const data = generateQuizInput.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)

  const { defaultModel } = await listAvailableModels()
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const query = data.topics || "key concepts"
  const hits = await searchChunks(session.user.id, query, {
    moduleId: data.moduleId,
    limit: 6,
  })
  const context =
    hits.length > 0
      ? "\n\nBase the questions on these excerpts from the user's study materials:\n" +
        hits.map((h) => `[${h.materialName}] ${h.content.slice(0, 1000)}`).join("\n---\n")
      : ""

  const { object, usage } = await generateObject({
    model,
    schema: generatedQuizSchema,
    prompt: `Create a quiz with ${data.count} exam-style questions about: ${query}.
${data.mixed ? "Mix multiple_choice (with exactly 4 plausible options) and free_text questions (about 70/30)." : "Use only multiple_choice questions with exactly 4 plausible options."}
Each question gets a short explanation of the correct answer. Write in the same language as the topic.${context}`,
  })

  await logUsage(session.user.id, defaultModel, "quiz", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })

  const [created] = await db
    .insert(quiz)
    .values({
      userId: session.user.id,
      title: object.title,
      moduleId: data.moduleId || null,
      aiGenerated: true,
    })
    .returning({ id: quiz.id })

  const questions = object.questions.slice(0, data.count)
  if (questions.length > 0) {
    await db.insert(question).values(
      questions.map((q, i) => ({
        quizId: created.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.kind === "multiple_choice" ? q.options : null,
        correctIndex:
          q.kind === "multiple_choice" && q.correctIndex >= 0 ? q.correctIndex : null,
        referenceAnswer: q.kind === "free_text" ? q.referenceAnswer : null,
        explanation: q.explanation || null,
        sortOrder: i,
      }))
    )
  }

  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

// ---- Attempts & grading --------------------------------------------------------

const submitSchema = z.object({
  quizId: z.string(),
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })),
})

export type AttemptResult = {
  score: number
  results: {
    questionId: string
    prompt: string
    answer: string
    correct: boolean
    feedback: string | null
    explanation: string | null
  }[]
}

export async function submitAttempt(input: unknown): Promise<AttemptResult> {
  const session = await requireSession()
  const data = submitSchema.parse(input)
  await ownQuiz(data.quizId, session.user.id)

  const questions = await db.query.question.findMany({
    where: eq(question.quizId, data.quizId),
  })
  const byId = new Map(questions.map((q) => [q.id, q]))

  // Optional AI grading for free-text questions
  let gradeFreeText:
    | ((prompt: string, reference: string, answer: string) => Promise<{ correct: boolean; feedback: string }>)
    | null = null
  const { defaultModel } = await listAvailableModels()
  if (defaultModel && data.answers.some((a) => byId.get(a.questionId)?.kind === "free_text")) {
    await assertWithinLimit(session.user.id)
    const model = await getLanguageModel(defaultModel, session.user.id)
    gradeFreeText = async (prompt, reference, answer) => {
      const { object, usage } = await generateObject({
        model,
        schema: z.object({ correct: z.boolean(), feedback: z.string() }),
        prompt: `Grade this student answer. Question: "${prompt}"
Reference answer: "${reference}"
Student answer: "${answer}"
Judge leniently on wording but strictly on content. Reply with correct=true/false and one sentence of feedback in the language of the question.`,
      })
      await logUsage(session.user.id, defaultModel, "quiz-grading", {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
      return object
    }
  }

  const results: AttemptResult["results"] = []
  for (const { questionId, answer } of data.answers) {
    const q = byId.get(questionId)
    if (!q) continue
    let correct = false
    let feedback: string | null = null
    if (q.kind === "multiple_choice") {
      correct = q.correctIndex != null && Number(answer) === q.correctIndex
    } else if (gradeFreeText && q.referenceAnswer) {
      const graded = await gradeFreeText(q.prompt, q.referenceAnswer, answer)
      correct = graded.correct
      feedback = graded.feedback
    } else {
      // no AI available: simple contains-check fallback
      correct =
        q.referenceAnswer != null &&
        answer.trim().toLowerCase().includes(q.referenceAnswer.trim().toLowerCase().slice(0, 30))
    }
    results.push({
      questionId,
      prompt: q.prompt,
      answer,
      correct,
      feedback,
      explanation: q.explanation,
    })
  }

  const score =
    results.length === 0 ? 0 : Math.round((results.filter((r) => r.correct).length / results.length) * 100)

  const [attempt] = await db
    .insert(quizAttempt)
    .values({
      quizId: data.quizId,
      userId: session.user.id,
      score: String(score),
      finishedAt: new Date(),
    })
    .returning({ id: quizAttempt.id })

  if (results.length > 0) {
    await db.insert(answerLog).values(
      results.map((r) => ({
        attemptId: attempt.id,
        questionId: r.questionId,
        answer: r.answer,
        correct: r.correct,
        feedback: r.feedback,
      }))
    )
  }

  revalidatePath("/", "layout")
  return { score, results }
}

/** Question ids answered incorrectly in the user's latest finished attempt. */
export async function getWrongQuestionIds(quizId: string): Promise<string[]> {
  const session = await requireSession()
  await ownQuiz(quizId, session.user.id)
  const latest = await db.query.quizAttempt.findFirst({
    where: and(eq(quizAttempt.quizId, quizId), eq(quizAttempt.userId, session.user.id)),
    orderBy: [desc(quizAttempt.startedAt)],
    with: { answers: true },
  })
  if (!latest) return []
  return latest.answers.filter((a) => a.correct === false).map((a) => a.questionId)
}
