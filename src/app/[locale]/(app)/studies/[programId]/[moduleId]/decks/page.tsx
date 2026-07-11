import * as React from "react"
import { and, desc, eq } from "drizzle-orm"
import { Layers, Play } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { Link } from "@/i18n/navigation"
import { deleteDeck } from "@/app/[locale]/(app)/deck-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { DeckDialog } from "@/components/learn/deck-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
  const color = getModuleColorClasses(mod.color)
  const Icon = getModuleIcon(mod.icon)

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => {
            const dueCount = d.cards.filter((c) => c.due <= now).length
            return (
              <div
                key={d.id}
                className={cn(
                  "bg-card relative rounded-xl border p-4",
                  // Stacked "set" look: two offset layers peeking out behind.
                  "before:bg-card after:bg-card before:absolute before:inset-x-2 before:-z-10 before:-bottom-1 before:h-4 before:rounded-b-xl before:border after:absolute after:inset-x-4 after:-z-20 after:-bottom-2 after:h-4 after:rounded-b-xl after:border"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      color.soft,
                      color.text
                    )}
                  >
                    {React.createElement(Icon, { className: "size-5" })}
                  </span>
                  <Link
                    href={`${basePath}/decks/${d.id}`}
                    className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
                  >
                    {d.name}
                  </Link>
                  {d.aiGenerated && <AiBadge iconOnly />}
                </div>
                <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                  <Layers className="size-3.5" />
                  {t("cards", { count: d.cards.length })}
                  {dueCount > 0 && (
                    <Badge variant="default" className="ml-auto">
                      {t("due", { count: dueCount })}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1"
                    nativeButton={false}
                    render={<Link href={`${basePath}/decks/${d.id}/study`} />}
                  >
                    <Play className="size-4" />
                    {t("study")}
                  </Button>
                  <DeleteButton action={deleteDeck.bind(null, d.id)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
