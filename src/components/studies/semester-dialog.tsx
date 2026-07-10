"use client"

import * as React from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSemester, updateSemester } from "@/app/[locale]/(app)/studies/actions"

type SemesterData = {
  id?: string
  name: string
  startDate: string | null
  endDate: string | null
}

export function SemesterDialog({
  programId,
  semester,
  open: controlledOpen,
  onOpenChange,
}: {
  programId: string
  semester?: SemesterData
  /** Controlled mode (no trigger rendered) — used by the sidebar menus. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("studies")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => {
    if (controlled) onOpenChange?.(v)
    else setUncontrolledOpen(v)
  }
  const [pending, setPending] = React.useState(false)
  const isEdit = Boolean(semester?.id)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      name: String(form.get("name")),
      startDate: String(form.get("startDate") || "") || null,
      endDate: String(form.get("endDate") || "") || null,
    }
    setPending(true)
    try {
      if (isEdit) await updateSemester(semester!.id!, payload)
      else await createSemester(programId, payload)
      toast.success(isEdit ? t("updated") : t("created"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger
          render={isEdit ? <Button variant="ghost" size="icon-sm" /> : <Button variant="outline" size="sm" />}
        >
          {isEdit ? (
            <Pencil className="size-3.5" />
          ) : (
            <>
              <Plus className="size-4" />
              {t("newSemester")}
            </>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editSemester") : t("newSemester")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">{t("semester.name")}</Label>
            <Input id="s-name" name="name" defaultValue={semester?.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-start">{t("semester.startDate")}</Label>
              <Input
                id="s-start"
                name="startDate"
                type="date"
                defaultValue={semester?.startDate ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-end">{t("semester.endDate")}</Label>
              <Input id="s-end" name="endDate" type="date" defaultValue={semester?.endDate ?? ""} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
  )
}
