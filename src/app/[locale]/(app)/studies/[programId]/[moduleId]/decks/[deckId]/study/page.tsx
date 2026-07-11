import { notFound } from "next/navigation"
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { StudySession } from "@/components/learn/study-session"

export type StudyMode = "due" | "order" | "random" | "wrong" | "least"

export default async function ModuleStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; moduleId: string; deckId: string }>
  searchParams: Promise<{ mode?: string; count?: string }>
}) {
  const { programId, moduleId, deckId } = await params
  const { mode: rawMode, count: rawCount } = await searchParams
  const session = await requireSession()

  const mode: StudyMode = ["due", "order", "random", "wrong", "least"].includes(rawMode ?? "")
    ? (rawMode as StudyMode)
    : "due"
  const count = Math.min(Math.max(Number(rawCount) || 50, 1), 100)

  const deckRow = await db.query.deck.findFirst({
    where: and(eq(deck.id, deckId), eq(deck.userId, session.user.id)),
  })
  if (!deckRow || deckRow.moduleId !== moduleId) notFound()

  const base = { columns: { id: true, front: true, back: true } as const, limit: count }
  const cards = await (() => {
    switch (mode) {
      case "order":
        return db.query.flashcard.findMany({
          ...base,
          where: eq(flashcard.deckId, deckId),
          orderBy: [asc(flashcard.createdAt)],
        })
      case "random":
        return db.query.flashcard.findMany({
          ...base,
          where: eq(flashcard.deckId, deckId),
          orderBy: sql`random()`,
        })
      case "wrong":
        return db.query.flashcard.findMany({
          ...base,
          where: and(eq(flashcard.deckId, deckId), gt(flashcard.lapses, 0)),
          orderBy: [desc(flashcard.lapses)],
        })
      case "least":
        return db.query.flashcard.findMany({
          ...base,
          where: eq(flashcard.deckId, deckId),
          orderBy: [asc(flashcard.reps), asc(flashcard.createdAt)],
        })
      default:
        return db.query.flashcard.findMany({
          ...base,
          where: and(eq(flashcard.deckId, deckId), lte(flashcard.due, new Date())),
          orderBy: [asc(flashcard.due)],
        })
    }
  })()

  // Always render StudySession — the empty state lives inside it so that the
  // completion screen survives the path revalidation triggered by reviewCard.
  return (
    <StudySession
      backHref={`/studies/${programId}/${moduleId}/decks/${deckId}`}
      cards={cards}
      moduleId={moduleId}
    />
  )
}
