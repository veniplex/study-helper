import { and, desc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { Link } from "@/i18n/navigation"
import { deleteDeck } from "@/app/[locale]/(app)/deck-actions"
import { DeckDialog } from "@/components/learn/deck-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function ModuleDecksPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("learn.decks")
  const basePath = `/studies/${programId}/${moduleId}`

  const decks = await db.query.deck.findMany({
    where: and(eq(deck.userId, session.user.id), eq(deck.moduleId, moduleId)),
    orderBy: [desc(deck.updatedAt)],
    with: { cards: { columns: { id: true, due: true } } },
  })
  const now = new Date()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DeckDialog
          modules={[{ id: mod.id, name: mod.name }]}
          fixedModuleId={mod.id}
          basePath={basePath}
        />
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
                  href={`${basePath}/decks/${d.id}`}
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {d.name}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {t("cards", { count: d.cards.length })}
                </span>
                {dueCount > 0 && <Badge variant="default">{t("due", { count: dueCount })}</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`${basePath}/decks/${d.id}/study`} />}
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
