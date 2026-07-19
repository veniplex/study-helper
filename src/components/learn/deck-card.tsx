"use client"

import * as React from "react"
import { Layers, MoreHorizontal, Pencil, Play, Trash2, Wand2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { deleteDeck } from "@/app/[locale]/(app)/deck-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { EditDeckDialog } from "@/components/learn/deck-dialogs"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu, type ContextMenuAction } from "@/components/entity-context-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type DeckCardData = {
  id: string
  name: string
  description: string | null
  aiGenerated: boolean
  /** `"mistakes"` decks are auto-created from wrong quiz answers (system-owned). */
  kind: "normal" | "mistakes"
  cardCount: number
  dueCount: number
}

export function DeckCard({
  deck,
  basePath,
  glyph,
  colorSoft,
  colorText,
}: {
  deck: DeckCardData
  basePath: string
  glyph: React.ReactNode
  colorSoft: string
  colorText: string
}) {
  const t = useTranslations("learn.decks")
  const tCommon = useTranslations("common")
  const router = useRouter()
  // A mistakes deck is system-owned: render a stable localized label + badge
  // regardless of the (locale-at-creation) name stored in the DB.
  const isMistakes = deck.kind === "mistakes"
  const displayName = isMistakes ? t("mistakesName") : deck.name
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const actions: ContextMenuAction[] = [
    { label: tCommon("edit"), icon: Pencil, onSelect: () => setEditOpen(true) },
    {
      label: tCommon("delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => setDeleteOpen(true),
      separatorBefore: true,
    },
  ]

  return (
    <>
      <EntityContextMenu items={actions} label={deck.name}>
        <div
          className={cn(
            "group bg-card relative rounded-xl border p-4",
            "before:bg-card after:bg-card before:absolute before:inset-x-2 before:-z-10 before:-bottom-1 before:h-4 before:rounded-b-xl before:border after:absolute after:inset-x-4 after:-z-20 after:-bottom-2 after:h-4 after:rounded-b-xl after:border"
          )}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                colorSoft,
                colorText
              )}
            >
              {glyph}
            </span>
            <Link
              href={`${basePath}/decks/${deck.id}`}
              className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
            >
              {displayName}
            </Link>
            {isMistakes && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge variant="secondary" className="gap-1">
                      <Wand2 className="size-3" />
                      {t("mistakesBadge")}
                    </Badge>
                  }
                />
                <TooltipContent>{t("mistakesTooltip")}</TooltipContent>
              </Tooltip>
            )}
            {deck.aiGenerated && <AiBadge iconOnly />}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground -mt-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                    aria-label={deck.name}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  {tCommon("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
            <Layers className="size-3.5" />
            {t("cards", { count: deck.cardCount })}
            {deck.dueCount > 0 && (
              <Badge variant="default" className="ml-auto">
                {t("due", { count: deck.dueCount })}
              </Badge>
            )}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              className="w-full"
              nativeButton={false}
              render={<Link href={`${basePath}/decks/${deck.id}/study`} />}
            >
              <Play className="size-4" />
              {t("study")}
            </Button>
          </div>
        </div>
      </EntityContextMenu>
      <EditDeckDialog
        deckId={deck.id}
        initialName={deck.name}
        initialDescription={deck.description}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={deck.name}
        onConfirm={async () => {
          await deleteDeck(deck.id)
          router.refresh()
        }}
      />
    </>
  )
}
