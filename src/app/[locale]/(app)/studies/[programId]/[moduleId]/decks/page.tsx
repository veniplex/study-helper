import * as React from "react"
import { and, desc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { deck } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { DeckCard } from "@/components/learn/deck-card"
import { DeckDialog } from "@/components/learn/deck-dialogs"
import { EmptyState } from "@/components/ui/empty-state"
import { Layers } from "lucide-react"

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
        <EmptyState icon={Layers} title={t("empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <DeckCard
              key={d.id}
              deck={{
                id: d.id,
                name: d.name,
                description: d.description,
                aiGenerated: d.aiGenerated,
                kind: d.kind,
                cardCount: d.cards.length,
                dueCount: d.cards.filter((c) => c.due <= now).length,
              }}
              basePath={basePath}
              glyph={React.createElement(Icon, { className: "size-5" })}
              colorSoft={color.soft}
              colorText={color.text}
            />
          ))}
        </div>
      )}
    </div>
  )
}
