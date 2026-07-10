"use client"

import * as React from "react"
import { CalendarPlus, Loader2, Plus, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ai/markdown"
import { DeleteButton } from "@/components/studies/delete-button"
import {
  addMilestone,
  deleteMilestone,
  deleteThesis,
  generateMilestones,
  generateOutline,
  toggleMilestone,
  updateThesis,
} from "@/app/[locale]/(app)/thesis/actions"
import { cn } from "@/lib/utils"

const PHASES = ["topic", "exposé", "research", "writing", "revision", "submitted"] as const
type Phase = (typeof PHASES)[number]

export type SemesterOption = { id: string; label: string }

export type ThesisData = {
  id: string
  title: string
  thesisType: string | null
  semesterId: string | null
  phase: Phase
  researchQuestion: string | null
  outline: string | null
  notes: string | null
  dueDate: string | null
  milestones: {
    id: string
    title: string
    description: string | null
    dueDate: string | null
    done: boolean
  }[]
}

export function ThesisWorkspace({
  thesis,
  aiAvailable,
  semesters,
}: {
  thesis: ThesisData
  aiAvailable: boolean
  semesters: SemesterOption[]
}) {
  const t = useTranslations("thesis")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [phase, setPhase] = React.useState<Phase>(thesis.phase)
  const [researchQuestion, setResearchQuestion] = React.useState(thesis.researchQuestion ?? "")
  const [notes, setNotes] = React.useState(thesis.notes ?? "")
  const [dueDate, setDueDate] = React.useState(thesis.dueDate ?? "")
  const [semesterId, setSemesterId] = React.useState(thesis.semesterId ?? "")
  const [addToCalendar, setAddToCalendar] = React.useState(true)

  async function run(key: string, fn: () => Promise<unknown>) {
    setPending(key)
    try {
      await fn()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(null)
    }
  }

  async function save() {
    await run("save", async () => {
      await updateThesis(thesis.id, {
        phase,
        researchQuestion: researchQuestion || null,
        notes: notes || null,
        dueDate: dueDate || null,
        semesterId: semesterId || null,
      })
      toast.success(t("saved"))
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">
          {thesis.title}
          {thesis.thesisType && (
            <Badge variant="secondary" className="ml-2">
              {thesis.thesisType}
            </Badge>
          )}
        </h2>
        <DeleteButton action={deleteThesis.bind(null, thesis.id)} />
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("phase")}</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as Phase)}>
              <SelectTrigger className="w-full">
                <SelectValue>{t(`phases.${phase}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`phases.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="th-due">{t("dueDate")}</Label>
            <Input
              id="th-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
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
          <div className="flex items-end">
            <Button onClick={save} disabled={pending === "save"}>
              {pending === "save" && <Loader2 className="size-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </div>
          <div className="col-span-full space-y-1.5">
            <Label htmlFor="th-rq">{t("researchQuestion")}</Label>
            <Textarea
              id="th-rq"
              rows={2}
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
            />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label htmlFor="th-notes">{t("notes")}</Label>
            <Textarea
              id="th-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("outline")}</CardTitle>
          {aiAvailable && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending === "outline"}
              onClick={() => run("outline", () => generateOutline(thesis.id))}
            >
              {pending === "outline" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {t("generateOutline")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {thesis.outline ? (
            <Markdown>{thesis.outline}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm">–</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("milestones")}</CardTitle>
          {aiAvailable && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs">
                <Switch checked={addToCalendar} onCheckedChange={setAddToCalendar} />
                <CalendarPlus className="size-3.5" />
                {t("addToCalendar")}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pending === "milestones"}
                onClick={() =>
                  run("milestones", () => generateMilestones(thesis.id, addToCalendar))
                }
              >
                {pending === "milestones" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {t("generateMilestones")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1.5">
            {thesis.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={() => run(`ms-${m.id}`, () => toggleMilestone(m.id, !m.done))}
                  className="accent-primary size-4 cursor-pointer"
                />
                <span className={cn("font-medium", m.done && "text-muted-foreground line-through")}>
                  {m.title}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">{m.dueDate ?? ""}</span>
                <DeleteButton action={deleteMilestone.bind(null, m.id)} />
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              const target = e.currentTarget
              void run("add-ms", async () => {
                await addMilestone(thesis.id, {
                  title: String(form.get("title")),
                  dueDate: String(form.get("dueDate") || "") || null,
                })
                target.reset()
              })
            }}
          >
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="ms-title" className="text-xs">
                {t("milestoneTitle")}
              </Label>
              <Input id="ms-title" name="title" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-date" className="text-xs">
                {t("milestoneDate")}
              </Label>
              <Input id="ms-date" name="dueDate" type="date" />
            </div>
            <Button type="submit" variant="outline" disabled={pending === "add-ms"}>
              {pending === "add-ms" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {t("addMilestone")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
