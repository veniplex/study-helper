import { and, asc, count, eq, inArray, lte } from "drizzle-orm"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { StudySession } from "@/components/learn/study-session"

const SESSION_LIMIT = 100

/** Global "study everything due" session across all of the user's decks. */
export default async function DueStudyPage() {
  const session = await requireSession()

  const userDecks = await db.query.deck.findMany({
    where: eq(deck.userId, session.user.id),
    columns: { id: true },
  })
  const deckIds = userDecks.map((d) => d.id)

  const now = new Date()
  const [cards, totalRows] = deckIds.length
    ? await Promise.all([
        db.query.flashcard.findMany({
          // FSRS fields included for the rating-button interval preview (E8).
          columns: {
            id: true,
            front: true,
            back: true,
            due: true,
            stability: true,
            difficulty: true,
            elapsedDays: true,
            scheduledDays: true,
            learningSteps: true,
            reps: true,
            lapses: true,
            state: true,
            lastReview: true,
          },
          where: (f, { and: a }) => a(inArray(f.deckId, deckIds), lte(f.due, now)),
          orderBy: [asc(flashcard.due)],
          limit: SESSION_LIMIT,
        }),
        db
          .select({ value: count() })
          .from(flashcard)
          .where(and(inArray(flashcard.deckId, deckIds), lte(flashcard.due, now))),
      ])
    : [[], [{ value: 0 }]]

  return <StudySession backHref="/" cards={cards} totalDue={totalRows[0]?.value ?? cards.length} />
}
