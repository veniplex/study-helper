"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateObject } from "ai"
import { getLocale } from "next-intl/server"
import { z } from "zod"
import { db } from "@/db"
import { deck, flashcard, reviewLog } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { searchChunks, getModuleMaterialSample } from "@/lib/ai/rag"
import { assertWithinLimit } from "@/lib/ai/usage"
import { runAi } from "@/lib/ai/run"
import { scheduleReview, type ReviewRating } from "@/lib/learning/fsrs"
import { logAudit } from "@/lib/audit"
import { ownModule } from "@/lib/studies/access"
import { languageNameForLocale } from "@/lib/ai/language"

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
  revalidatePath("/")
  return { ok: true as const, id: created.id }
}

export async function updateDeck(deckId: string, input: unknown) {
  const session = await requireSession()
  const before = await ownDeck(deckId, session.user.id)
  const data = deckSchema.pick({ name: true, description: true }).parse(input)
  await db
    .update(deck)
    .set({ name: data.name, description: data.description ?? null })
    .where(eq(deck.id, deckId))
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "deck",
    entityId: deckId,
    entityLabel: data.name,
    before,
    after: { ...before, ...data },
  })
  revalidatePath("/")
  return { ok: true as const }
}

export async function deleteDeck(deckId: string) {
  const session = await requireSession()
  const row = await ownDeck(deckId, session.user.id)
  await db.delete(deck).where(and(eq(deck.id, deckId), eq(deck.userId, session.user.id)))
  // No FK on the polymorphic targetId — clean generation rows up explicitly.
  const { deleteGenerationDataForTarget } = await import("@/lib/ai/generation/cleanup")
  await deleteGenerationDataForTarget(deckId)
  await logAudit({
    userId: session.user.id,
    operation: "delete",
    entityType: "deck",
    entityId: deckId,
    entityLabel: row.name,
    before: row,
  })
  revalidatePath("/")
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
  revalidatePath("/")
  return { ok: true as const }
}

/**
 * Imports cards from TSV/CSV text (one card per line, front<TAB>back or
 * front;back). Anki users: export as "Notes in Plain Text (.txt)". Duplicate
 * fronts (existing or within the file) are skipped.
 */
export async function importCards(deckId: string, text: unknown) {
  const session = await requireSession()
  await ownDeck(deckId, session.user.id)
  const raw = z
    .string()
    .max(2 * 1024 * 1024)
    .parse(text)

  const existing = await db.query.flashcard.findMany({
    where: eq(flashcard.deckId, deckId),
    columns: { front: true },
  })
  const seen = new Set(existing.map((c) => c.front))

  const rows: { front: string; back: string }[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (rows.length >= 1000) break
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const sep = trimmed.includes("\t") ? "\t" : ";"
    const idx = trimmed.indexOf(sep)
    if (idx < 1) continue
    const front = trimmed.slice(0, idx).trim().slice(0, 4000)
    const back = trimmed
      .slice(idx + 1)
      .trim()
      .slice(0, 4000)
    if (!front || !back || seen.has(front)) continue
    seen.add(front)
    rows.push({ front, back })
  }

  if (rows.length > 0) {
    await db.insert(flashcard).values(rows.map((r) => ({ deckId, ...r })))
    const row = await ownDeck(deckId, session.user.id)
    await logAudit({
      userId: session.user.id,
      operation: "create",
      entityType: "deck",
      entityId: deckId,
      entityLabel: `${row.name} (+${rows.length} import)`,
    })
  }
  revalidatePath("/")
  return { ok: true as const, imported: rows.length }
}

/** Imports cards from an Anki .apkg export (legacy format). */
export async function importAnkiDeck(deckId: string, formData: FormData) {
  const session = await requireSession()
  await ownDeck(deckId, session.user.id)
  const file = formData.get("file")
  if (!(file instanceof File)) throw new Error("file required")
  if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50 MB)")

  const { parseApkg } = await import("@/lib/learning/anki-import")
  const cards = await parseApkg(Buffer.from(await file.arrayBuffer()))

  const existing = await db.query.flashcard.findMany({
    where: eq(flashcard.deckId, deckId),
    columns: { front: true },
  })
  const seen = new Set(existing.map((c) => c.front))
  const fresh = cards.filter((c) => !seen.has(c.front) && (seen.add(c.front), true))

  if (fresh.length > 0) {
    await db.insert(flashcard).values(fresh.map((c) => ({ deckId, ...c })))
    const row = await ownDeck(deckId, session.user.id)
    await logAudit({
      userId: session.user.id,
      operation: "create",
      entityType: "deck",
      entityId: deckId,
      entityLabel: `${row.name} (+${fresh.length} Anki)`,
    })
  }
  revalidatePath("/")
  return { ok: true as const, imported: fresh.length, skipped: cards.length - fresh.length }
}

export async function updateCard(cardId: string, input: unknown) {
  const session = await requireSession()
  const card = await db.query.flashcard.findFirst({
    where: eq(flashcard.id, cardId),
    with: { deck: true },
  })
  if (!card || card.deck.userId !== session.user.id) throw new Error("Not found")
  const data = cardSchema.parse(input)
  await db
    .update(flashcard)
    .set({ front: data.front, back: data.back })
    .where(eq(flashcard.id, cardId))
  const { deck: _deck, ...cardRow } = card // eslint-disable-line @typescript-eslint/no-unused-vars
  await logAudit({
    userId: session.user.id,
    operation: "update",
    entityType: "flashcard",
    entityId: cardId,
    entityLabel: data.front.slice(0, 80),
    before: cardRow,
    after: { ...cardRow, ...data },
  })
  revalidatePath("/")
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
  revalidatePath("/")
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

  const defaultModel = await resolveModelForUser(session.user.id)
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const moduleRow = deckRow.moduleId ? await ownModule(deckRow.moduleId, session.user.id) : null
  const query = data.topics || [deckRow.name, moduleRow?.name].filter(Boolean).join(" ")
  let hits = await searchChunks(session.user.id, query, {
    moduleId: deckRow.moduleId,
    limit: 6,
  })
  if (hits.length === 0 && deckRow.moduleId) {
    hits = await getModuleMaterialSample(session.user.id, deckRow.moduleId)
  }
  const context =
    hits.length > 0
      ? "\n\nBase the cards on these excerpts from the user's study materials:\n" +
        hits.map((h) => `[${h.materialName}] ${h.content.slice(0, 1000)}`).join("\n---\n")
      : ""

  const locale = await getLocale()
  const language = languageNameForLocale(locale)

  const { object } = await runAi(
    {
      userId: session.user.id,
      model: defaultModel,
      feature: "flashcards",
      moduleId: deckRow.moduleId,
      entityType: "deck",
      entityId: data.deckId,
      entityLabel: deckRow.name,
    },
    () =>
      generateObject({
        model,
        schema: generatedCardsSchema,
        prompt: `Create ${data.count} high-quality flashcards for spaced repetition about: ${query}.
Each card has a concise question/term on the front and a precise answer/definition on the back.
Write all cards in ${language}, regardless of the language of the topic text or source materials.${context}`,
      })
  )

  const cards = object.cards.slice(0, data.count)
  if (cards.length > 0) {
    await db
      .insert(flashcard)
      .values(cards.map((c) => ({ deckId: data.deckId, front: c.front, back: c.back })))
  }
  revalidatePath("/")
  return { ok: true as const, count: cards.length }
}
