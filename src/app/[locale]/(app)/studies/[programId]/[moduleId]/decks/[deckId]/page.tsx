import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { Link } from "@/i18n/navigation"
import { AddCardForm, GenerateCardsDialog } from "@/components/learn/deck-dialogs"
import { FlashcardRow } from "@/components/learn/flashcard-row"
import { Button } from "@/components/ui/button"

export default async function ModuleDeckDetailPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string; deckId: string }>
}) {
  const { programId, moduleId, deckId } = await params
  const session = await requireSession()
  const t = await getTranslations("learn.decks")
  const basePath = `/studies/${programId}/${moduleId}`

  const [deckRow, { defaultModel }] = await Promise.all([
    db.query.deck.findFirst({
      where: and(eq(deck.id, deckId), eq(deck.userId, session.user.id)),
      with: { cards: { orderBy: [asc(flashcard.createdAt)] } },
    }),
    listAvailableModels(),
  ])
  if (!deckRow || deckRow.moduleId !== moduleId) notFound()

  const now = new Date()
  const dueCount = deckRow.cards.filter((c) => c.due <= now).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{deckRow.name}</h2>
        <GenerateCardsDialog deckId={deckRow.id} aiAvailable={Boolean(defaultModel)} />
        {dueCount > 0 && (
          <Button
            nativeButton={false}
            render={<Link href={`${basePath}/decks/${deckRow.id}/study`} />}
          >
            {t("study")} ({dueCount})
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {deckRow.cards.map((card) => (
          <FlashcardRow key={card.id} card={{ id: card.id, front: card.front, back: card.back }} />
        ))}
      </ul>

      <AddCardForm deckId={deckRow.id} />
    </div>
  )
}
