import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck, flashcard } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { Link } from "@/i18n/navigation"
import { deleteCard } from "@/app/[locale]/(app)/learn/decks/actions"
import { AddCardForm, GenerateCardsDialog } from "@/components/learn/deck-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ deckId: string }>
}) {
  const { deckId } = await params
  const session = await requireSession()
  const t = await getTranslations("learn.decks")

  const [deckRow, { defaultModel }] = await Promise.all([
    db.query.deck.findFirst({
      where: and(eq(deck.id, deckId), eq(deck.userId, session.user.id)),
      with: { module: true, cards: { orderBy: [asc(flashcard.createdAt)] } },
    }),
    listAvailableModels(),
  ])
  if (!deckRow) notFound()

  const now = new Date()
  const dueCount = deckRow.cards.filter((c) => c.due <= now).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">
          {deckRow.name}
          {deckRow.module && (
            <Badge variant="secondary" className="ml-2">
              {deckRow.module.name}
            </Badge>
          )}
        </h2>
        <GenerateCardsDialog deckId={deckRow.id} aiAvailable={Boolean(defaultModel)} />
        {dueCount > 0 && (
          <Button nativeButton={false} render={<Link href={`/learn/decks/${deckRow.id}/study`} />}>
            {t("study")} ({dueCount})
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {deckRow.cards.map((card) => (
          <li
            key={card.id}
            className="grid gap-1 rounded-md border px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3"
          >
            <span className="font-medium">{card.front}</span>
            <span className="text-muted-foreground">{card.back}</span>
            <span className="flex justify-end">
              <DeleteButton action={deleteCard.bind(null, card.id)} />
            </span>
          </li>
        ))}
      </ul>

      <AddCardForm deckId={deckRow.id} />
    </div>
  )
}
