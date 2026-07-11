import { asc, eq, inArray, lte } from "drizzle-orm"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { StudySession } from "@/components/learn/study-session"

/** Global "study everything due" session across all of the user's decks. */
export default async function DueStudyPage() {
  const session = await requireSession()

  const userDecks = await db.query.deck.findMany({
    where: eq(deck.userId, session.user.id),
    columns: { id: true },
  })
  const deckIds = userDecks.map((d) => d.id)

  const cards = deckIds.length
    ? await db.query.flashcard.findMany({
        columns: { id: true, front: true, back: true },
        where: (f, { and: a }) => a(inArray(f.deckId, deckIds), lte(f.due, new Date())),
        orderBy: [asc(flashcard.due)],
        limit: 100,
      })
    : []

  return <StudySession backHref="/" cards={cards} />
}
