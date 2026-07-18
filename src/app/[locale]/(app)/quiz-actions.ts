"use server"
import { GEN_PARAMS, GRADING_PARAMS } from "@/lib/ai/params"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"
import { generateObject } from "ai"
import { getLocale } from "next-intl/server"
import { z } from "zod"
import { db } from "@/db"
import { answerLog, question, quiz, quizAttempt } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { searchChunks, getModuleMaterialSample } from "@/lib/ai/rag"
import { assertWithinLimit } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"
import { languageNameForLocale } from "@/lib/ai/language"

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
  description: z.string().max(1000).optional().nullable(),
  moduleId: z.string().optional().nullable(),
})

export async function createQuiz(input: unknown) {
  const session = await requireSession()
  const data = quizSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  const [created] = await db
    .insert(quiz)
    .values({
      userId: session.user.id,
      title: data.title,
      description: data.description || null,
      moduleId: data.moduleId || null,
    })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "quiz",
    entityId: created.id,
    entityLabel: data.title,
    after: created,
  })
  revalidatePath("/")
  return { ok: true as const, id: created.id }
}

export async function updateQuiz(quizId: string, input: unknown) {
  const session = await requireSession()
  const before = await ownQuiz(quizId, session.user.id)
  const data = quizSchema.pick({ title: true, description: true }).parse(input)
  await db
    .update(quiz)
    .set({ title: data.title, description: data.description || null })
    .where(eq(quiz.id, quizId))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "quiz",
    entityId: quizId,
    entityLabel: data.title,
    before,
    after: { ...before, title: data.title, description: data.description ?? null },
  })
  revalidatePath("/")
  return { ok: true as const }
}

export async function deleteQuiz(quizId: string) {
  const session = await requireSession()
  const row = await ownQuiz(quizId, session.user.id)
  await db.delete(quiz).where(and(eq(quiz.id, quizId), eq(quiz.userId, session.user.id)))
  // No FK on the polymorphic targetId — clean generation rows up explicitly.
  const { deleteGenerationDataForTarget } = await import("@/lib/ai/generation/cleanup")
  await deleteGenerationDataForTarget(quizId)
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "quiz",
    entityId: quizId,
    entityLabel: row.title,
    before: row,
  })
  revalidatePath("/")
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
  const [created] = await db
    .insert(question)
    .values({
      quizId,
      kind: data.kind,
      prompt: data.prompt,
      options: data.kind === "multiple_choice" ? data.options : null,
      correctIndex: data.kind === "multiple_choice" ? data.correctIndex : null,
      referenceAnswer: data.kind === "free_text" ? data.referenceAnswer : null,
      explanation: data.explanation ?? null,
    })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "question",
    entityId: created.id,
    entityLabel: data.prompt.slice(0, 80),
    after: created,
  })
  revalidatePath("/")
  return { ok: true as const }
}

export async function updateQuestion(questionId: string, input: unknown) {
  const session = await requireSession()
  const row = await db.query.question.findFirst({
    where: eq(question.id, questionId),
    with: { quiz: true },
  })
  if (!row || row.quiz.userId !== session.user.id) throw new Error("Not found")
  const data = questionSchema.parse(input)
  await db
    .update(question)
    .set({
      kind: data.kind,
      prompt: data.prompt,
      options: data.kind === "multiple_choice" ? data.options : null,
      correctIndex: data.kind === "multiple_choice" ? data.correctIndex : null,
      referenceAnswer: data.kind === "free_text" ? data.referenceAnswer : null,
      explanation: data.explanation ?? null,
    })
    .where(eq(question.id, questionId))
  const { quiz: _quiz2, ...questionRow } = row // eslint-disable-line @typescript-eslint/no-unused-vars
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "question",
    entityId: questionId,
    entityLabel: data.prompt.slice(0, 80),
    before: questionRow,
    after: { ...questionRow, ...data },
  })
  revalidatePath("/")
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
  const { quiz: _quiz, ...questionRow } = row // eslint-disable-line @typescript-eslint/no-unused-vars
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "question",
    entityId: questionId,
    entityLabel: row.prompt.slice(0, 80),
    before: questionRow,
  })
  revalidatePath("/")
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
  description: z.string().describe("one short sentence describing the quiz topic"),
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
  const moduleRow = data.moduleId ? await ownModule(data.moduleId, session.user.id) : null

  const defaultModel = await resolveModelForUser(session.user.id)
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const query = data.topics || moduleRow?.name || "key concepts"
  let hits = await searchChunks(session.user.id, query, {
    moduleId: data.moduleId,
    limit: 6,
  })
  if (hits.length === 0 && data.moduleId) {
    hits = await getModuleMaterialSample(session.user.id, data.moduleId)
  }
  const context =
    hits.length > 0
      ? "\n\nBase the questions on these excerpts from the user's study materials:\n" +
        hits.map((h) => `[${h.materialName}] ${h.content.slice(0, 1000)}`).join("\n---\n")
      : ""

  const locale = await getLocale()
  const language = languageNameForLocale(locale)

  const { object } = await runAi(
    {
      userId: session.user.id,
      model: defaultModel,
      feature: "quiz",
      moduleId: data.moduleId ?? null,
      entityType: "quiz",
      entityLabel: moduleRow?.name ?? query.slice(0, 80),
    },
    () =>
      generateObject({
        model,
        ...GEN_PARAMS,
        schema: generatedQuizSchema,
        prompt: `Create a quiz with ${data.count} exam-style questions about: ${query}.
${data.mixed ? "Mix multiple_choice (with exactly 4 plausible options) and free_text questions (about 70/30)." : "Use only multiple_choice questions with exactly 4 plausible options."}
Each question gets a short explanation of the correct answer. Write all questions, options, and explanations in ${language}, regardless of the language of the topic text or source materials.${context}`,
      })
  )

  const [created] = await db
    .insert(quiz)
    .values({
      userId: session.user.id,
      title: object.title,
      description: object.description || null,
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
        correctIndex: q.kind === "multiple_choice" && q.correctIndex >= 0 ? q.correctIndex : null,
        referenceAnswer: q.kind === "free_text" ? q.referenceAnswer : null,
        explanation: q.explanation || null,
        sortOrder: i,
      }))
    )
  }

  revalidatePath("/")
  return { ok: true as const, id: created.id }
}

// ---- Attempts & grading --------------------------------------------------------

const submitSchema = z.object({
  quizId: z.string(),
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })),
  /** Actual time spent in the runner; falls back to an estimate when absent. */
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(6 * 60 * 60)
    .optional(),
})

export type AttemptResult = {
  score: number
  results: {
    questionId: string
    prompt: string
    answer: string
    /** Human-readable answer (MC: option text instead of its index). */
    answerText: string
    /** The correct answer (MC: option text, free text: reference answer). */
    correctAnswer: string | null
    correct: boolean
    /** False when a free-text answer could not be graded (no AI configured). */
    graded: boolean
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
    | ((
        prompt: string,
        reference: string,
        answer: string
      ) => Promise<{ correct: boolean; feedback: string }>)
    | null = null
  const defaultModel = await resolveModelForUser(session.user.id)
  if (defaultModel && data.answers.some((a) => byId.get(a.questionId)?.kind === "free_text")) {
    await assertWithinLimit(session.user.id)
    const model = await getLanguageModel(defaultModel, session.user.id)
    gradeFreeText = async (prompt, reference, answer) => {
      const { object } = await runAi(
        {
          userId: session.user.id,
          model: defaultModel,
          feature: "quiz-grading",
          entityType: "quiz",
          entityId: data.quizId,
          entityLabel: prompt.slice(0, 80),
        },
        () =>
          generateObject({
            model,
            // Deterministic: a re-submitted identical answer must not flip
            // between correct and incorrect.
            ...GRADING_PARAMS,
            schema: z.object({ correct: z.boolean(), feedback: z.string() }),
            prompt: `Grade this student answer against the reference.
Question: "${prompt}"
Reference answer: "${reference}"
Student answer: "${answer}"

Grading rubric:
- correct=true only if the answer contains the core facts/concepts of the reference; wording, order and minor omissions do not matter.
- correct=false if a core fact is missing, wrong, or contradicted — even when parts are right.
- An empty, off-topic or "I don't know" answer is always false.
- Ignore spelling/grammar entirely.
Reply with correct=true/false and one sentence of feedback in the language of the question.`,
          })
      )
      return object
    }
  }

  const results: AttemptResult["results"] = []
  for (const { questionId, answer } of data.answers) {
    const q = byId.get(questionId)
    if (!q) continue
    let correct = false
    let graded = true
    let feedback: string | null = null
    if (q.kind === "multiple_choice") {
      correct = q.correctIndex != null && Number(answer) === q.correctIndex
    } else if (gradeFreeText && q.referenceAnswer) {
      const result = await gradeFreeText(q.prompt, q.referenceAnswer, answer)
      correct = result.correct
      feedback = result.feedback
    } else {
      // No AI available: don't pretend to grade free text — the runner shows
      // the reference answer and excludes the question from the score.
      graded = false
    }
    const answerText =
      q.kind === "multiple_choice" ? (q.options?.[Number(answer)] ?? answer) : answer
    const correctAnswer =
      q.kind === "multiple_choice"
        ? q.correctIndex != null
          ? (q.options?.[q.correctIndex] ?? null)
          : null
        : q.referenceAnswer
    results.push({
      questionId,
      prompt: q.prompt,
      answer,
      answerText,
      correctAnswer,
      correct,
      graded,
      feedback,
      explanation: q.explanation,
    })
  }

  const gradedResults = results.filter((r) => r.graded)
  const score =
    gradedResults.length === 0
      ? 0
      : Math.round((gradedResults.filter((r) => r.correct).length / gradedResults.length) * 100)

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

  // Count the quiz run as a study session for the module's learning stats.
  // Prefer the measured runner time over the per-question estimate.
  const quizRow = byId.size > 0 ? await ownQuiz(data.quizId, session.user.id) : null
  const { studySession } = await import("@/db/schema")
  await db.insert(studySession).values({
    userId: session.user.id,
    moduleId: quizRow?.moduleId ?? null,
    durationMinutes:
      data.durationSeconds != null
        ? Math.max(1, Math.round(data.durationSeconds / 60))
        : Math.max(1, Math.round(results.length * 0.75)),
    kind: "quiz",
  })

  // Feed wrong answers into the module's auto-managed "mistakes" deck so they
  // come back through spaced repetition.
  const wrong = results.filter((r) => r.graded && !r.correct && r.correctAnswer)
  if (wrong.length > 0) {
    await addToMistakesDeck(session.user.id, quizRow?.moduleId ?? null, wrong)
  }

  revalidatePath("/")
  return { score, results }
}

/**
 * Upserts wrong quiz answers as flashcards into the user's per-module
 * "mistakes" deck (created on demand). Duplicate prompts are skipped so
 * repeated failures don't multiply cards.
 */
async function addToMistakesDeck(
  userId: string,
  moduleId: string | null,
  wrong: { prompt: string; correctAnswer: string | null; explanation: string | null }[]
): Promise<void> {
  const { deck, flashcard } = await import("@/db/schema")
  let mistakes = await db.query.deck.findFirst({
    where: and(
      eq(deck.userId, userId),
      eq(deck.kind, "mistakes"),
      moduleId ? eq(deck.moduleId, moduleId) : isNull(deck.moduleId)
    ),
  })
  if (!mistakes) {
    ;[mistakes] = await db
      .insert(deck)
      .values({ userId, moduleId, name: "Quiz-Fehler", kind: "mistakes" })
      .returning()
  }
  const existing = await db.query.flashcard.findMany({
    where: eq(flashcard.deckId, mistakes.id),
    columns: { front: true },
  })
  const seen = new Set(existing.map((c) => c.front))
  const fresh = wrong.filter((w) => !seen.has(w.prompt))
  if (fresh.length > 0) {
    await db.insert(flashcard).values(
      fresh.map((w) => ({
        deckId: mistakes.id,
        front: w.prompt,
        back: w.explanation ? `${w.correctAnswer}\n\n${w.explanation}` : (w.correctAnswer ?? ""),
      }))
    )
  }
}
