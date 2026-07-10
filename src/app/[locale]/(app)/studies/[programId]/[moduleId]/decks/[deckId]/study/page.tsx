import { notFound } from "next/navigation"
import { and, asc, eq, lte } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { StudySession } from "@/components/learn/study-session"

export default async function ModuleStudyPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string; deckId: string }>
}) {
  const { programId, moduleId, deckId } = await params
  const session = await requireSession()
  const t = await getTranslations("learn.decks")

  const deckRow = await db.query.deck.findFirst({
    where: and(eq(deck.id, deckId), eq(deck.userId, session.user.id)),
  })
  if (!deckRow || deckRow.moduleId !== moduleId) notFound()

  const dueCards = await db.query.flashcard.findMany({
    where: and(eq(flashcard.deckId, deckId), lte(flashcard.due, new Date())),
    orderBy: [asc(flashcard.due)],
    limit: 50,
    columns: { id: true, front: true, back: true },
  })

  if (dueCards.length === 0) {
    return <p className="text-muted-foreground py-12 text-center text-sm">{t("noDue")}</p>
  }

  return (
    <StudySession
      backHref={`/studies/${programId}/${moduleId}/decks/${deckId}`}
      cards={dueCards}
    />
  )
}
