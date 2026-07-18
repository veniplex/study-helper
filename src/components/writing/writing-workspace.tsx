"use client"

import * as React from "react"
import { BookMarked, CalendarPlus, Loader2, Plus, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import type { WritingKind, WritingPhase, WritingVariant } from "@/db/schema/thesis"
import { phasesFor } from "@/lib/writing/phases"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { WritingMilestoneRow } from "@/components/writing/writing-milestone-row"
import {
  addWritingMilestone,
  deleteWritingProject,
  generateWritingMilestones,
  generateWritingOutline,
  suggestWritingSources,
  updateWritingProject,
} from "@/app/[locale]/(app)/studies/writing-actions"

export type SemesterOption = { id: string; label: string }

export type WritingProjectData = {
  id: string
  title: string
  thesisType: string | null
  semesterId: string | null
  phase: WritingPhase
  researchQuestion: string | null
  taskDescription: string | null
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

type SourceSuggestions = {
  searchTerms: string[]
  sources: { name: string; reason: string }[]
}

export function WritingWorkspace(props: {
  project: WritingProjectData
  variant: WritingVariant
  kind: WritingKind
  aiAvailable: boolean
  basePath: string
  semesters?: SemesterOption[]
  requiresSources?: boolean
}) {
  const { project, variant, aiAvailable, semesters, requiresSources } = props
  const t = useTranslations("writing")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const isTask = variant === "task"
  const phases = phasesFor(variant)
  const phaseKey = isTask ? "taskPhases" : "phases"

  const [pending, setPending] = React.useState<string | null>(null)
  const [phase, setPhase] = React.useState<WritingPhase>(project.phase)
  const [researchQuestion, setResearchQuestion] = React.useState(project.researchQuestion ?? "")
  const [taskDescription, setTaskDescription] = React.useState(project.taskDescription ?? "")
  const [notes, setNotes] = React.useState(project.notes ?? "")
  const [dueDate, setDueDate] = React.useState(project.dueDate ?? "")
  const [semesterId, setSemesterId] = React.useState(project.semesterId ?? "")
  const [addToCalendar, setAddToCalendar] = React.useState(true)
  const [sources, setSources] = React.useState<SourceSuggestions | null>(null)

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
      await updateWritingProject(project.id, {
        phase,
        researchQuestion: isTask ? undefined : researchQuestion || null,
        taskDescription: isTask ? taskDescription || null : undefined,
        notes: notes || null,
        dueDate: dueDate || null,
        semesterId: semesters ? semesterId || null : undefined,
      })
      toast.success(t("saved"))
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">
          {project.title}
          {project.thesisType && (
            <Badge variant="secondary" className="ml-2">
              {project.thesisType}
            </Badge>
          )}
        </h2>
        <DeleteButton action={deleteWritingProject.bind(null, project.id)} />
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("phase")}</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as WritingPhase)}>
              <SelectTrigger className="w-full">
                <SelectValue>{t(`${phaseKey}.${phase}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`${phaseKey}.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wr-due">{t("dueDate")}</Label>
            <Input
              id="wr-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {semesters && (
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
          )}
          <div className="flex items-end">
            <Button onClick={save} disabled={pending === "save"}>
              {pending === "save" && <Loader2 className="size-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </div>
          {isTask ? (
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="wr-task">{t("taskDescription")}</Label>
              <Textarea
                id="wr-task"
                rows={4}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
              />
            </div>
          ) : (
            <div className="col-span-full space-y-1.5">
              <Label htmlFor="wr-rq">{t("researchQuestion")}</Label>
              <Textarea
                id="wr-rq"
                rows={2}
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
              />
            </div>
          )}
          <div className="col-span-full space-y-1.5">
            <Label htmlFor="wr-notes">{t("notes")}</Label>
            <Textarea
              id="wr-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{isTask ? t("steps") : t("outline")}</CardTitle>
          {aiAvailable && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending === "outline"}
              onClick={() => run("outline", () => generateWritingOutline(project.id))}
            >
              {pending === "outline" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {isTask ? t("generateSteps") : t("generateOutline")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {project.outline ? (
            <Markdown>{project.outline}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm">–</p>
          )}
        </CardContent>
      </Card>

      {requiresSources && aiAvailable && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("sources")}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={pending === "sources"}
              onClick={() =>
                run("sources", async () => {
                  const result = await suggestWritingSources(project.id)
                  setSources(result)
                })
              }
            >
              {pending === "sources" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BookMarked className="size-3.5" />
              )}
              {t("suggestSources")}
            </Button>
          </CardHeader>
          {sources && (
            <CardContent className="space-y-4 text-sm">
              {sources.searchTerms.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium">{t("searchTerms")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.searchTerms.map((term, i) => (
                      <Badge key={i} variant="outline">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {sources.sources.length > 0 && (
                <ul className="space-y-1.5">
                  {sources.sources.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground"> — {s.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          )}
        </Card>
      )}

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
                  run("milestones", () => generateWritingMilestones(project.id, addToCalendar))
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
            {project.milestones.map((m) => (
              <WritingMilestoneRow
                key={m.id}
                milestone={{ id: m.id, title: m.title, dueDate: m.dueDate, done: m.done }}
              />
            ))}
          </ul>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              const target = e.currentTarget
              void run("add-ms", async () => {
                await addWritingMilestone(project.id, {
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
