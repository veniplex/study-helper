"use client"

import * as React from "react"
import { Loader2, Plus, Sparkles } from "lucide-react"
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
import {
  addPlanItem,
  createPlan,
  generateStudyPlan,
} from "@/app/[locale]/(app)/learn/actions"
import { ModuleSelect, type ModuleOption } from "./module-select"

export function PlanDialog({ modules }: { modules: ModuleOption[] }) {
  const t = useTranslations("learn.plans")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await createPlan({
        title: String(form.get("title")),
        description: String(form.get("description") || "") || null,
        moduleId: moduleId || null,
      })
      setOpen(false)
      router.push(`/learn/plans/${result.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="size-4" />
        {t("new")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-title">{t("title")}</Label>
            <Input id="p-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">{t("description")}</Label>
            <Textarea id="p-desc" name="description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{tLearn("module")}</Label>
            <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
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

export function GeneratePlanDialog({
  modules,
  aiAvailable,
}: {
  modules: ModuleOption[]
  aiAvailable: boolean
}) {
  const t = useTranslations("learn.plans.generateDialog")
  const tPlans = useTranslations("learn.plans")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState("")

  if (!aiAvailable) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await generateStudyPlan({
        moduleId: moduleId || null,
        examDate: String(form.get("examDate")),
        hoursPerWeek: Number(form.get("hoursPerWeek")),
        topics: String(form.get("topics")),
        useMaterials: true,
      })
      setOpen(false)
      router.push(`/learn/plans/${result.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Sparkles className="size-4" />
        {tPlans("generate")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gen-exam">{t("examDate")}</Label>
              <Input id="gen-exam" name="examDate" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-hours">{t("hoursPerWeek")}</Label>
              <Input
                id="gen-hours"
                name="hoursPerWeek"
                type="number"
                min={1}
                max={80}
                defaultValue={10}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tLearn("module")}</Label>
            <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-topics">{t("topics")}</Label>
            <Textarea id="gen-topics" name="topics" rows={4} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? t("generating") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AddPlanItemForm({ planId }: { planId: string }) {
  const t = useTranslations("learn.plans")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await addPlanItem(planId, {
        title: String(form.get("title")),
        scheduledDate: String(form.get("scheduledDate") || "") || null,
        durationMinutes: form.get("durationMinutes")
          ? Number(form.get("durationMinutes"))
          : null,
      })
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1 space-y-1">
        <Label htmlFor="item-title" className="text-xs">
          {t("itemTitle")}
        </Label>
        <Input id="item-title" name="title" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-date" className="text-xs">
          {t("itemDate")}
        </Label>
        <Input id="item-date" name="scheduledDate" type="date" />
      </div>
      <div className="w-28 space-y-1">
        <Label htmlFor="item-duration" className="text-xs">
          {t("itemDuration")}
        </Label>
        <Input id="item-duration" name="durationMinutes" type="number" min={5} step={5} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("addItem")}
      </Button>
    </form>
  )
}
