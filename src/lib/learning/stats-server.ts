import "server-only"
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { deck, flashcard, quiz, quizAttempt, reviewLog, studySession } from "@/db/schema"
import {
  buildHeatmap,
  computeStreak,
  countByDay,
  mergeDayCounts,
  minutesLast7Days,
  toDayKey,
  type HeatmapCell,
} from "./stats"

export type DashboardStats = {
  streak: number
  weekMinutes: number
  heatmap: HeatmapCell[]
}

const HEATMAP_WEEKS = 26

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const since = new Date()
  since.setDate(since.getDate() - HEATMAP_WEEKS * 7)

  const [reviews, attempts, sessions] = await Promise.all([
    db.query.reviewLog.findMany({
      where: and(eq(reviewLog.userId, userId), gte(reviewLog.reviewedAt, since)),
      columns: { reviewedAt: true },
    }),
    db.query.quizAttempt.findMany({
      where: and(
        eq(quizAttempt.userId, userId),
        isNotNull(quizAttempt.finishedAt),
        gte(quizAttempt.startedAt, since)
      ),
      columns: { startedAt: true },
    }),
    db.query.studySession.findMany({
      where: and(eq(studySession.userId, userId), gte(studySession.startedAt, since)),
      columns: { startedAt: true, durationMinutes: true },
    }),
  ])

  const counts = mergeDayCounts(
    countByDay(reviews.map((r) => r.reviewedAt)),
    countByDay(attempts.map((a) => a.startedAt)),
    countByDay(sessions.map((s) => s.startedAt))
  )
  const today = toDayKey(new Date())

  return {
    streak: computeStreak(counts.keys(), today),
    weekMinutes: minutesLast7Days(sessions, today),
    heatmap: buildHeatmap(counts, today, HEATMAP_WEEKS),
  }
}

/**
 * Heuristic exam-preparedness score (0–100) per module, from the latest quiz
 * score per quiz (60%) and the share of flashcards in FSRS review state (40%).
 * null when there is no learning data yet.
 */
export async function getPreparednessByModule(
  userId: string,
  moduleIds: string[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  if (moduleIds.length === 0) return result
  for (const id of moduleIds) result.set(id, null)

  const [quizzes, decks] = await Promise.all([
    db.query.quiz.findMany({
      where: and(eq(quiz.userId, userId), inArray(quiz.moduleId, moduleIds)),
      columns: { id: true, moduleId: true },
      with: {
        attempts: {
          where: (a, { isNotNull: nn }) => nn(a.finishedAt),
          orderBy: (a, { desc: d }) => [d(a.startedAt)],
          limit: 1,
          columns: { score: true },
        },
      },
    }),
    db.query.deck.findMany({
      where: and(eq(deck.userId, userId), inArray(deck.moduleId, moduleIds)),
      columns: { id: true, moduleId: true },
      with: { cards: { columns: { state: true } } },
    }),
  ])

  for (const moduleId of moduleIds) {
    const scores = quizzes
      .filter((q) => q.moduleId === moduleId && q.attempts.length > 0)
      .map((q) => Number(q.attempts[0].score ?? 0))
    const cards = decks.filter((d) => d.moduleId === moduleId).flatMap((d) => d.cards)
    const quizFactor = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length / 100
      : null
    const cardFactor = cards.length
      ? cards.filter((c) => c.state >= 2).length / cards.length
      : null

    if (quizFactor == null && cardFactor == null) continue
    const parts: [number, number][] = []
    if (quizFactor != null) parts.push([quizFactor, 0.6])
    if (cardFactor != null) parts.push([cardFactor, 0.4])
    const totalWeight = parts.reduce((s, [, w]) => s + w, 0)
    const score = parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight
    result.set(moduleId, Math.round(score * 100))
  }
  return result
}

export type ModuleStats = {
  dueCards: number
  lastQuizScore: number | null
  totalMinutes: number
}

export async function getModuleStats(userId: string, moduleId: string): Promise<ModuleStats> {
  const decks = await db.query.deck.findMany({
    where: and(eq(deck.userId, userId), eq(deck.moduleId, moduleId)),
    columns: { id: true },
  })
  const deckIds = decks.map((d) => d.id)

  const [dueCards, quizzes, sessions] = await Promise.all([
    deckIds.length === 0
      ? Promise.resolve([])
      : db.query.flashcard.findMany({
          where: inArray(flashcard.deckId, deckIds),
          columns: { id: true, due: true },
        }),
    db.query.quiz.findMany({
      where: and(eq(quiz.userId, userId), eq(quiz.moduleId, moduleId)),
      columns: { id: true },
    }),
    db.query.studySession.findMany({
      where: and(eq(studySession.userId, userId), eq(studySession.moduleId, moduleId)),
      columns: { durationMinutes: true },
    }),
  ])

  let lastQuizScore: number | null = null
  if (quizzes.length > 0) {
    const lastAttempt = await db.query.quizAttempt.findFirst({
      where: and(
        eq(quizAttempt.userId, userId),
        isNotNull(quizAttempt.finishedAt),
        inArray(
          quizAttempt.quizId,
          quizzes.map((q) => q.id)
        )
      ),
      orderBy: [desc(quizAttempt.startedAt)],
      columns: { score: true },
    })
    lastQuizScore = lastAttempt?.score != null ? Number(lastAttempt.score) : null
  }

  const now = new Date()
  return {
    dueCards: dueCards.filter((c) => c.due <= now).length,
    lastQuizScore,
    totalMinutes: sessions.reduce((sum, s) => sum + s.durationMinutes, 0),
  }
}
