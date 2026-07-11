"use client"

import * as React from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { deleteCard } from "@/app/[locale]/(app)/deck-actions"
import { EditCardDialog } from "@/components/learn/deck-dialogs"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu, type ContextMenuAction } from "@/components/entity-context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function FlashcardRow({
  card,
}: {
  card: { id: string; front: string; back: string }
}) {
  const tCommon = useTranslations("common")
  const router = useRouter()
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
      <EntityContextMenu items={actions} label={card.front.slice(0, 40)}>
        <li className="group grid gap-1 rounded-md border px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3">
          <span className="font-medium">{card.front}</span>
          <span className="text-muted-foreground">{card.back}</span>
          <span className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                    aria-label={card.front.slice(0, 40)}
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
          </span>
        </li>
      </EntityContextMenu>
      <EditCardDialog
        cardId={card.id}
        initialFront={card.front}
        initialBack={card.back}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={card.front.slice(0, 40)}
        onConfirm={async () => {
          await deleteCard(card.id)
          router.refresh()
        }}
      />
    </>
  )
}
