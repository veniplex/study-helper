"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import { deck, flashcard, reviewLog } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, listAvailableModels } from "@/lib/ai/registry"
import { searchChunks } from "@/lib/ai/rag"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { scheduleReview, type ReviewRating } from "@/lib/learning/fsrs"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"

const deckSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  moduleId: z.string().optional().nullable(),
})

export async function createDeck(input: unknown) {
  const session = await requireSession()
  const data = deckSchema.parse(input)
  if (data.moduleId) await ownModule(data.moduleId, session.user.id)
  const [created] = await db
    .insert(deck)
    .values({
      userId: session.user.id,
      name: data.name,
      description: data.description ?? null,
      moduleId: data.moduleId || null,
    })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "deck",
    entityId: created.id,
    entityLabel: data.name,
    after: created,
  })
  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

export async function deleteDeck(deckId: string) {
  const session = await requireSession()
  const row = await ownDeck(deckId, session.user.id)
  await db.delete(deck).where(and(eq(deck.id, deckId), eq(deck.userId, session.user.id)))
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "deck",
    entityId: deckId,
    entityLabel: row.name,
    before: row,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

async function ownDeck(deckId: string, userId: string) {
  const row = await db.query.deck.findFirst({
    where: and(eq(deck.id, deckId), eq(deck.userId, userId)),
  })
  if (!row) throw new Error("Not found")
  return row
}

const cardSchema = z.object({
  front: z.string().min(1).max(4000),
  back: z.string().min(1).max(4000),
})

export async function addCard(deckId: string, input: unknown) {
  const session = await requireSession()
  await ownDeck(deckId, session.user.id)
  const data = cardSchema.parse(input)
  const [created] = await db
    .insert(flashcard)
    .values({ deckId, front: data.front, back: data.back })
    .returning()
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "flashcard",
    entityId: created.id,
    entityLabel: data.front.slice(0, 80),
    after: created,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}



export async function deleteCard(cardId: string) {
  const session = await requireSession()
  const card = await db.query.flashcard.findFirst({
    where: eq(flashcard.id, cardId),
    with: { deck: true },
  })
  if (!card || card.deck.userId !== session.user.id) throw new Error("Not found")
  await db.delete(flashcard).where(eq(flashcard.id, cardId))
  const { deck: _deck, ...cardRow } = card // eslint-disable-line @typescript-eslint/no-unused-vars
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "flashcard",
    entityId: cardId,
    entityLabel: card.front.slice(0, 80),
    before: cardRow,
  })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function reviewCard(cardId: string, rating: ReviewRating) {
  const session = await requireSession()
  const card = await db.query.flashcard.findFirst({
    where: eq(flashcard.id, cardId),
    with: { deck: true },
  })
  if (!card || card.deck.userId !== session.user.id) throw new Error("Not found")

  const updated = scheduleReview(
    {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReview: card.lastReview,
    },
    rating
  )

  await db.update(flashcard).set(updated).where(eq(flashcard.id, cardId))
  await db.insert(reviewLog).values({ cardId, userId: session.user.id, rating })
  return { ok: true as const, nextDue: updated.due.toISOString() }
}

// ---- AI card generation ----------------------------------------------------------

const generateCardsInput = z.object({
  deckId: z.string(),
  count: z.number().int().min(1).max(50),
  topics: z.string().max(2000).optional(),
})

const generatedCardsSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).max(60),
})

export async function generateCards(input: unknown) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const data = generateCardsInput.parse(input)
  const deckRow = await ownDeck(data.deckId, session.user.id)

  const { defaultModel } = await listAvailableModels()
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const query = data.topics || deckRow.name
  const hits = await searchChunks(session.user.id, query, {
    moduleId: deckRow.moduleId,
    limit: 6,
  })
  const context =
    hits.length > 0
      ? "\n\nBase the cards on these excerpts from the user's study materials:\n" +
        hits.map((h) => `[${h.materialName}] ${h.content.slice(0, 1000)}`).join("\n---\n")
      : ""

  const { object, usage } = await generateObject({
    model,
    schema: generatedCardsSchema,
    prompt: `Create ${data.count} high-quality flashcards for spaced repetition about: ${query}.
Each card has a concise question/term on the front and a precise answer/definition on the back.
Write in the same language as the topic.${context}`,
  })

  await logUsage(session.user.id, defaultModel, "flashcards", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })

  const cards = object.cards.slice(0, data.count)
  if (cards.length > 0) {
    await db.insert(flashcard).values(
      cards.map((c) => ({ deckId: data.deckId, front: c.front, back: c.back }))
    )
  }
  revalidatePath("/", "layout")
  return { ok: true as const, count: cards.length }
}
