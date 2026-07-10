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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createQuiz, generateQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { ModuleSelect, type ModuleOption } from "./module-select"

export function QuizDialog({
  modules,
  fixedModuleId,
  basePath,
}: {
  modules: ModuleOption[]
  fixedModuleId?: string
  basePath: string
}) {
  const t = useTranslations("learn.quizzes")
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
      const result = await createQuiz({
        title: String(form.get("title")),
        moduleId: moduleId || null,
      })
      setOpen(false)
      router.push(`${basePath}/quizzes/${result.id}`)
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
            <Label htmlFor="q-title">{t("title")}</Label>
            <Input id="q-title" name="title" required />
          </div>
          {!fixedModuleId && (
            <div className="space-y-1.5">
              <Label>{tLearn("module")}</Label>
              <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
            </div>
          )}
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

export function GenerateQuizDialog({
  modules,
  aiAvailable,
  fixedModuleId,
  basePath,
}: {
  modules: ModuleOption[]
  aiAvailable: boolean
  fixedModuleId?: string
  basePath: string
}) {
  const t = useTranslations("learn.quizzes.generateDialog")
  const tQuiz = useTranslations("learn.quizzes")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")
  const [mixed, setMixed] = React.useState(true)

  if (!aiAvailable) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await generateQuiz({
        moduleId: moduleId || null,
        count: Number(form.get("count")),
        topics: String(form.get("topics") || "") || undefined,
        mixed,
      })
      setOpen(false)
      router.push(`${basePath}/quizzes/${result.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Sparkles className="size-4" />
        {tQuiz("generate")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gq-count">{t("count")}</Label>
              <Input
                id="gq-count"
                name="count"
                type="number"
                min={1}
                max={30}
                defaultValue={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("kind")}</Label>
              <Select
                value={mixed ? "mixed" : "mc"}
                onValueChange={(v) => setMixed(v === "mixed")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{mixed ? t("kindMixed") : t("kindMc")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">{t("kindMixed")}</SelectItem>
                  <SelectItem value="mc">{t("kindMc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!fixedModuleId && (
            <div className="space-y-1.5">
              <Label>{tLearn("module")}</Label>
              <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="gq-topics">{t("topics")}</Label>
            <Textarea id="gq-topics" name="topics" rows={3} />
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
