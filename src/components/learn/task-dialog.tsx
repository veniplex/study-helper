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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createTask } from "@/app/[locale]/(app)/learn-actions"
import { ModuleSelect, type ModuleOption } from "./module-select"

type Priority = "low" | "medium" | "high"

export function TaskDialog({
  modules,
  parentId,
  fixedModuleId,
}: {
  modules: ModuleOption[]
  parentId?: string
  fixedModuleId?: string
}) {
  const t = useTranslations("learn.tasks")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [priority, setPriority] = React.useState<Priority>("medium")
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")

  const priorityLabels: Record<Priority, string> = {
    low: t("priorityLow"),
    medium: t("priorityMedium"),
    high: t("priorityHigh"),
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createTask({
        title: String(form.get("title")),
        notes: String(form.get("notes") || "") || null,
        priority,
        dueDate: String(form.get("dueDate") || "") || null,
        moduleId: moduleId || null,
        parentId: parentId ?? null,
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
      <DialogTrigger
        render={parentId ? <Button variant="ghost" size="sm" /> : <Button />}
      >
        <Plus className="size-4" />
        {parentId ? t("subtask") : t("new")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">{t("title")}</Label>
            <Input id="t-title" name="title" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("priority")}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{priorityLabels[priority]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(priorityLabels) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabels[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">{t("dueDate")}</Label>
              <Input id="t-due" name="dueDate" type="date" />
            </div>
          </div>
          {!parentId && !fixedModuleId && (
            <div className="space-y-1.5">
              <Label>{tLearn("module")}</Label>
              <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-notes">{t("notes")}</Label>
            <Textarea id="t-notes" name="notes" rows={2} />
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
