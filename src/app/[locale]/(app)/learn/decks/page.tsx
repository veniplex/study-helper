import { desc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getModuleOptions } from "@/lib/studies/module-options"
import { Link } from "@/i18n/navigation"
import { deleteDeck } from "./actions"
import { DeckDialog } from "@/components/learn/deck-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function DecksPage() {
  const session = await requireSession()
  const t = await getTranslations("learn.decks")

  const [decks, modules] = await Promise.all([
    db.query.deck.findMany({
      where: eq(deck.userId, session.user.id),
      orderBy: [desc(deck.updatedAt)],
      with: { module: true, cards: { columns: { id: true, due: true } } },
    }),
    getModuleOptions(session.user.id),
  ])
  const now = new Date()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DeckDialog modules={modules} />
      </div>
      {decks.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {decks.map((d) => {
            const dueCount = d.cards.filter((c) => c.due <= now).length
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
              >
                <Link
                  href={`/learn/decks/${d.id}`}
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {d.name}
                </Link>
                {d.module && <Badge variant="outline">{d.module.name}</Badge>}
                <span className="text-muted-foreground text-xs">
                  {t("cards", { count: d.cards.length })}
                </span>
                {dueCount > 0 && (
                  <Badge variant="default">{t("due", { count: dueCount })}</Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/learn/decks/${d.id}/study`} />}
                >
                  {t("study")}
                </Button>
                <DeleteButton action={deleteDeck.bind(null, d.id)} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
