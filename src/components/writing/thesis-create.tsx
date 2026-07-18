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
import type { SemesterOption } from "@/components/writing/writing-workspace"
import { brainstormTopics, createThesis, updateThesis } from "@/app/[locale]/(app)/thesis/actions"

export function ThesisCreateDialog({
  semesters,
  programId,
}: {
  semesters: SemesterOption[]
  programId: string
}) {
  const t = useTranslations("thesis")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [semesterId, setSemesterId] = React.useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createThesis({
        title: String(form.get("title")),
        thesisType: String(form.get("thesisType") || "") || null,
        dueDate: String(form.get("dueDate") || "") || null,
        semesterId: semesterId || null,
        programId,
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
            <Label htmlFor="tc-title">{t("projectTitle")}</Label>
            <Input id="tc-title" name="title" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tc-type">{t("type")}</Label>
              <Input id="tc-type" name="thesisType" placeholder={t("typePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tc-due">{t("dueDate")}</Label>
              <Input id="tc-due" name="dueDate" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("semester")}</Label>
            <Select value={semesterId} onValueChange={(v) => setSemesterId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {semesters.find((s) => s.id === semesterId)?.label ?? t("noSemester")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("noSemester")}</SelectItem>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

type Topic = { title: string; description: string; researchQuestion: string }

export function BrainstormDialog({
  aiAvailable,
  programId,
}: {
  aiAvailable: boolean
  programId: string
}) {
  const t = useTranslations("thesis.brainstormDialog")
  const tThesis = useTranslations("thesis")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [adopting, setAdopting] = React.useState<number | null>(null)
  const [topics, setTopics] = React.useState<Topic[]>([])

  if (!aiAvailable) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await brainstormTopics(String(form.get("interests")))
      setTopics(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  async function adopt(topic: Topic, index: number) {
    setAdopting(index)
    try {
      const { id } = await createThesis({ title: topic.title, programId })
      await updateThesis(id, { researchQuestion: topic.researchQuestion, notes: topic.description })
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setAdopting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Sparkles className="size-4" />
        {tThesis("brainstorm")}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bs-interests">{t("interests")}</Label>
            <Textarea id="bs-interests" name="interests" rows={3} required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? t("generating") : t("submit")}
          </Button>
        </form>
        {topics.length > 0 && (
          <ul className="space-y-3">
            {topics.map((topic, i) => (
              <li key={i} className="space-y-1.5 rounded-md border p-3 text-sm">
                <p className="font-medium">{topic.title}</p>
                <p className="text-muted-foreground">{topic.description}</p>
                <p className="text-muted-foreground text-xs italic">{topic.researchQuestion}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={adopting !== null}
                  onClick={() => adopt(topic, i)}
                >
                  {adopting === i && <Loader2 className="size-3.5 animate-spin" />}
                  {t("useTopic")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
