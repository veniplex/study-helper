"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { createGoal } from "@/app/[locale]/(app)/learn-actions"
import { ModuleSelect, type ModuleOption } from "./module-select"

export function GoalDialog({
  modules,
  fixedModuleId,
}: {
  modules: ModuleOption[]
  fixedModuleId?: string
}) {
  const t = useTranslations("learn.goals")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createGoal({
        title: String(form.get("title")),
        description: String(form.get("description") || "") || null,
        targetDate: String(form.get("targetDate") || "") || null,
        moduleId: moduleId || null,
      })
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
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t("new")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-title">{t("title")}</Label>
            <Input id="g-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">{t("description")}</Label>
            <Textarea id="g-desc" name="description" rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-target">{t("targetDate")}</Label>
              <Input id="g-target" name="targetDate" type="date" />
            </div>
            {!fixedModuleId && (
              <div className="space-y-1.5">
                <Label>{tLearn("module")}</Label>
                <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
              </div>
            )}
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
