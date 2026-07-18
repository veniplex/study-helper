"use server"

import { and, eq } from "drizzle-orm"
import { getLocale } from "next-intl/server"
import { z } from "zod"
import { db } from "@/db"
import { deck } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { assertWithinLimit } from "@/lib/ai/usage"
import { languageNameForLocale } from "@/lib/ai/language"
import {
  getGenerationStatus,
  startDeckGeneration,
  startQuizGeneration,
} from "@/lib/ai/generation/generate"
import { ownModule } from "@/lib/studies/access"
import { formatExamContext, getModuleGoalContext } from "@/lib/studies/goal-context"

const deckInput = z.object({
  deckId: z.string(),
  perTopic: z.number().int().min(1).max(30).optional(),
})

/** Starts a coverage-driven "complete" fill of an existing deck. */
export async function startCompleteDeck(input: unknown) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const data = deckInput.parse(input)
  const row = await db.query.deck.findFirst({
    where: and(eq(deck.id, data.deckId), eq(deck.userId, session.user.id)),
  })
  if (!row) throw new Error("Not found")
  if (!row.moduleId) throw new Error("Deck must belong to a module for complete generation")
  await ownModule(row.moduleId, session.user.id)

  const language = languageNameForLocale(await getLocale())
  const examContext = formatExamContext(await getModuleGoalContext(row.moduleId))
  const jobId = await startDeckGeneration(session.user.id, data.deckId, row.moduleId, {
    perTopic: data.perTopic,
    language,
    examContext: examContext || undefined,
  })
  return { ok: true as const, jobId }
}

const quizInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1).max(200),
  perTopic: z.number().int().min(1).max(20).optional(),
  mixed: z.boolean().optional(),
})

/** Creates a quiz and starts a coverage-driven "complete" fill of it. */
export async function startCompleteQuiz(input: unknown) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const data = quizInput.parse(input)
  await ownModule(data.moduleId, session.user.id)

  const language = languageNameForLocale(await getLocale())
  const examContext = formatExamContext(await getModuleGoalContext(data.moduleId))
  const { jobId, quizId } = await startQuizGeneration(session.user.id, data.moduleId, {
    title: data.title,
    params: {
      perTopic: data.perTopic,
      mixed: data.mixed ?? true,
      language,
      examContext: examContext || undefined,
    },
  })
  return { ok: true as const, jobId, quizId }
}

/** Polls the progress/coverage of a generation job. */
export async function generationStatus(jobId: string) {
  const session = await requireSession()
  return getGenerationStatus(session.user.id, jobId)
}
