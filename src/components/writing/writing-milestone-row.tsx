"use client"

import * as React from "react"
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  deleteWritingMilestone,
  toggleWritingMilestone,
  updateWritingMilestone,
} from "@/app/[locale]/(app)/studies/writing-actions"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu, type ContextMenuAction } from "@/components/entity-context-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function WritingMilestoneRow({
  milestone,
}: {
  milestone: { id: string; title: string; dueDate: string | null; done: boolean }
}) {
  const t = useTranslations("writing")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onToggle() {
    try {
      await toggleWritingMilestone(milestone.id, !milestone.done)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await updateWritingMilestone(milestone.id, {
        title: String(form.get("title")),
        dueDate: String(form.get("dueDate") || "") || null,
      })
      setEditOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

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
      <EntityContextMenu items={actions} label={milestone.title}>
        <li className="group flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={milestone.done}
            onChange={onToggle}
            className="accent-primary size-4 cursor-pointer"
          />
          <span className={cn("font-medium", milestone.done && "text-muted-foreground line-through")}>
            {milestone.title}
          </span>
          <span className="text-muted-foreground ml-auto text-xs">{milestone.dueDate ?? ""}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                  aria-label={milestone.title}
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
        </li>
      </EntityContextMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editMilestone")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="em-title">{t("milestoneTitle")}</Label>
              <Input id="em-title" name="title" defaultValue={milestone.title} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-date">{t("milestoneDate")}</Label>
              <Input id="em-date" name="dueDate" type="date" defaultValue={milestone.dueDate ?? ""} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {tCommon("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={milestone.title}
        onConfirm={async () => {
          await deleteWritingMilestone(milestone.id)
          router.refresh()
        }}
      />
    </>
  )
}
