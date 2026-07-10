"use client"

import * as React from "react"
import { Loader2, Settings2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deleteProgram } from "@/app/[locale]/(app)/studies/actions"
import { ProgramDialog } from "./program-dialog"
import type { ProgramInfo } from "@/lib/studies/context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/** Sidebar entry point for degree-program CRUD. */
export function ProgramManageDialog({ programs }: { programs: ProgramInfo[] }) {
  const t = useTranslations("studies")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onDelete(id: string) {
    setPending(true)
    try {
      await deleteProgram(id)
      toast.success(t("deleted"))
      setConfirmDelete(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="shrink-0" title={t("managePrograms")} />
        }
      >
        <Settings2 className="size-4" />
        <span className="sr-only">{t("managePrograms")}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("managePrograms")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {programs.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                {(p.degreeType || p.institution) && (
                  <p className="text-muted-foreground truncate text-xs">
                    {[p.degreeType, p.institution].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <ProgramDialog program={p} />
              {confirmDelete === p.id ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => onDelete(p.id)}
                  >
                    {pending && <Loader2 className="size-3.5 animate-spin" />}
                    {tCommon("delete")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                    {tCommon("cancel")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmDelete(p.id)}
                  title={tCommon("delete")}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{tCommon("delete")}</span>
                </Button>
              )}
            </div>
          ))}
          {programs.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          )}
          <ProgramDialog />
        </div>
      </DialogContent>
    </Dialog>
  )
}
