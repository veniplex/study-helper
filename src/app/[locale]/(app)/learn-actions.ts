"use server"
import { GEN_PARAMS } from "@/lib/ai/params"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { assertAiAllowed } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { ownModule } from "@/lib/studies/access"
import { getModuleGoalContext } from "@/lib/studies/goal-context"

async function ownModuleOrNull(moduleId: string | null | undefined, userId: string) {
  if (moduleId) await ownModule(moduleId, userId)
  return moduleId || null
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

// ---- AI progress analysis --------------------------------------------------------

/**
 * Analyzes the user's full learning history for a module (quiz attempts,
 * flashcard reviews, study time) and returns a Markdown recommendation of what
 * to deepen — explicitly noting improvements over time.
 */
export async function analyzeProgress(moduleId: string) {
  const session = await requireSession()
  await assertAiAllowed(session.user.id)
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

  const goalCtx = await getModuleGoalContext(moduleId)

  const data = {
    goals: goalCtx.goals.map((g) => ({
      type: g.type,
      title: g.title,
      dueDate: g.dueDate,
      daysUntil: g.daysUntil,
    })),
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

  // Nearest upcoming (or otherwise first) goal, to anchor the recommendations.
  const upcomingGoal =
    goalCtx.goals
      .filter((g) => g.dueDate && (g.daysUntil == null || g.daysUntil >= 0))
      .sort((a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity))[0] ??
    goalCtx.goals[0] ??
    null
  const goalSentence = upcomingGoal
    ? `\n- Relate the recommendations to the upcoming ${upcomingGoal.title?.trim() || upcomingGoal.type}${upcomingGoal.dueDate ? ` on ${upcomingGoal.dueDate}` : ""}.`
    : ""

  const defaultModel = await resolveModelForUser(session.user.id)
  if (!defaultModel) actionError("AI_NO_MODEL")
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
        ...GEN_PARAMS,
        prompt: `You are a study coach. Analyze this learning history for one university module and tell the student what to deepen next.
Requirements:
- Answer in the language of the quiz/flashcard content (German if mixed).
- Look at trends ACROSS attempts over time: explicitly mention topics where the student has already improved, and topics that keep going wrong.
- Recommend 2-4 concrete focus areas with a short reason each.
- Keep it under 250 words, use Markdown with a short bullet list.${goalSentence}

Data (JSON): ${JSON.stringify(data).slice(0, 20000)}`,
      })
  )

  // Compact weak-topic list (recent wrong questions + most-lapsed cards) so
  // the UI can offer one-click "generate a review quiz/deck on my weak spots".
  const wrongQuestions = [
    ...new Set(
      data.quizzes.flatMap((q) => q.attempts.slice(0, 3).flatMap((a) => a.wrongQuestions))
    ),
  ].slice(0, 20)
  const lapsedFronts = data.problemFlashcards.slice(0, 10).map((c) => c.front)
  const weakTopics = [...wrongQuestions, ...lapsedFronts].join("\n").slice(0, 1500)

  return { ok: true as const, analysis: text, weakTopics }
}
