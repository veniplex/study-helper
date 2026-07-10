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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createModule, updateModule } from "@/app/[locale]/(app)/studies/actions"
import type { ModuleStatus } from "@/db/schema/studies"

type ModuleData = {
  id?: string
  name: string
  code: string | null
  ects: number | null
  instructor: string | null
  examType: string | null
  status: ModuleStatus
  notes: string | null
}

export function ModuleDialog({
  semesterId,
  module,
  open: controlledOpen,
  onOpenChange,
}: {
  semesterId: string
  module?: ModuleData
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
  const [status, setStatus] = React.useState<ModuleStatus>(module?.status ?? "planned")
  const isEdit = Boolean(module?.id)

  const statusLabels: Record<ModuleStatus, string> = {
    planned: t("module.statusPlanned"),
    active: t("module.statusActive"),
    passed: t("module.statusPassed"),
    failed: t("module.statusFailed"),
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      name: String(form.get("name")),
      code: String(form.get("code") || "") || null,
      ects: form.get("ects") ? Number(form.get("ects")) : null,
      instructor: String(form.get("instructor") || "") || null,
      examType: String(form.get("examType") || "") || null,
      status,
      notes: String(form.get("notes") || "") || null,
    }
    setPending(true)
    try {
      if (isEdit) await updateModule(module!.id!, payload)
      else await createModule(semesterId, payload)
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
          render={
            isEdit ? <Button variant="ghost" size="icon-sm" /> : <Button variant="outline" size="sm" />
          }
        >
          {isEdit ? (
            <Pencil className="size-3.5" />
          ) : (
            <>
              <Plus className="size-4" />
              {t("newModule")}
            </>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editModule") : t("newModule")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{t("module.name")}</Label>
            <Input id="m-name" name="name" defaultValue={module?.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-code">{t("module.code")}</Label>
              <Input id="m-code" name="code" defaultValue={module?.code ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-ects">{t("module.ects")}</Label>
              <Input
                id="m-ects"
                name="ects"
                type="number"
                min={0}
                max={60}
                defaultValue={module?.ects ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-instructor">{t("module.instructor")}</Label>
              <Input id="m-instructor" name="instructor" defaultValue={module?.instructor ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-exam">{t("module.examType")}</Label>
              <Input id="m-exam" name="examType" defaultValue={module?.examType ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("module.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ModuleStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{statusLabels[status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(statusLabels) as ModuleStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {statusLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-notes">{t("module.notes")}</Label>
            <Textarea id="m-notes" name="notes" rows={3} defaultValue={module?.notes ?? ""} />
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
