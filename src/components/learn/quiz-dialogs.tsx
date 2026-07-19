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
import { createQuiz, generateQuiz, updateQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { startCompleteQuiz } from "@/app/[locale]/(app)/generation-actions"
import { FormDialog } from "@/components/form-dialog"
import { ModuleSelect, type ModuleOption } from "./module-select"
import { GenerationProgress } from "./generation-progress"
import { EstimatedProgress } from "./estimated-progress"

/** Above this many items, a single-shot generation shows an estimated progress
 *  bar (E14) rather than a bare spinner. */
const LARGE_GENERATION = 10

/** Controlled edit dialog for a quiz's title/description (used by row menus). */
export function EditQuizDialog({
  quizId,
  initialTitle,
  initialDescription,
  open,
  onOpenChange,
}: {
  quizId: string
  initialTitle: string
  initialDescription: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("learn.quizzes")
  const router = useRouter()

  return (
    <FormDialog
      title={t("edit")}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={async (form) => {
        await updateQuiz(quizId, {
          title: String(form.get("title")),
          description: String(form.get("description") || "") || null,
        })
        router.refresh()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="eq-title">{t("title")}</Label>
        <Input id="eq-title" name="title" defaultValue={initialTitle} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="eq-desc">{t("description")}</Label>
        <Textarea
          id="eq-desc"
          name="description"
          rows={2}
          defaultValue={initialDescription ?? ""}
        />
      </div>
    </FormDialog>
  )
}

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
  const router = useRouter()
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")

  return (
    <FormDialog
      title={t("new")}
      triggerVariant="outline"
      trigger={
        <>
          <Plus className="size-4" />
          {t("new")}
        </>
      }
      onSubmit={async (form) => {
        const result = await createQuiz({
          title: String(form.get("title")),
          description: String(form.get("description") || "") || null,
          moduleId: moduleId || null,
        })
        router.push(`${basePath}/quizzes/${result.id}`)
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="q-title">{t("title")}</Label>
        <Input id="q-title" name="title" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-desc">{t("description")}</Label>
        <Textarea id="q-desc" name="description" rows={2} />
      </div>
      {!fixedModuleId && (
        <div className="space-y-1.5">
          <Label>{tLearn("module")}</Label>
          <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
        </div>
      )}
    </FormDialog>
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
  const tGen = useTranslations("learn.generation")
  const tQuiz = useTranslations("learn.quizzes")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")
  const [mixed, setMixed] = React.useState(true)
  const [complete, setComplete] = React.useState(false)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [createdQuizId, setCreatedQuizId] = React.useState<string | null>(null)
  // >0 while a large single-shot generation is running → estimated progress bar.
  const [estCount, setEstCount] = React.useState(0)

  if (!aiAvailable) return null

  function reset() {
    setJobId(null)
    setCreatedQuizId(null)
    setPending(false)
    setComplete(false)
    setEstCount(0)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      if (complete) {
        const targetModule = moduleId || fixedModuleId
        if (!targetModule) throw new Error(tLearn("selectModuleFirst"))
        const res = await startCompleteQuiz({
          moduleId: targetModule,
          title: String(form.get("title") || "").trim() || "Quiz",
          perTopic: Number(form.get("perTopic")) || undefined,
          mixed,
        })
        setCreatedQuizId(res.quizId)
        setJobId(res.jobId)
      } else {
        const count = Number(form.get("count"))
        if (count >= LARGE_GENERATION) setEstCount(count)
        const result = await generateQuiz({
          moduleId: moduleId || null,
          count,
          topics: String(form.get("topics") || "") || undefined,
          mixed,
        })
        setOpen(false)
        router.push(`${basePath}/quizzes/${result.id}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
      setEstCount(0)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger render={<Button />}>
        <Sparkles className="size-4" />
        {tQuiz("generate")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {jobId ? (
          <div className="space-y-4">
            <GenerationProgress
              jobId={jobId}
              onDone={() => {
                if (createdQuizId) router.push(`${basePath}/quizzes/${createdQuizId}`)
              }}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  if (createdQuizId) router.push(`${basePath}/quizzes/${createdQuizId}`)
                  setOpen(false)
                  reset()
                }}
              >
                {tGen("close")}
              </Button>
            </div>
          </div>
        ) : estCount > 0 ? (
          <EstimatedProgress count={estCount} label={t("generating")} />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="flex items-start gap-2 rounded-md border p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{tGen("complete")}</span>
                <span className="block text-xs text-muted-foreground">{tGen("completeHint")}</span>
              </span>
            </label>
            {complete && (
              <div className="space-y-1.5">
                <Label htmlFor="gq-quiztitle">{tGen("quizTitle")}</Label>
                <Input id="gq-quiztitle" name="title" required defaultValue={tQuiz("generate")} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gq-count">
                  {complete ? tGen("perTopicQuestions") : t("count")}
                </Label>
                {complete ? (
                  <Input
                    id="gq-count"
                    name="perTopic"
                    type="number"
                    min={1}
                    max={20}
                    defaultValue={4}
                    required
                  />
                ) : (
                  <Input
                    id="gq-count"
                    name="count"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={8}
                    required
                  />
                )}
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
            {!complete && (
              <div className="space-y-1.5">
                <Label htmlFor="gq-topics">{t("topics")}</Label>
                <Textarea id="gq-topics" name="topics" rows={3} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {complete ? tGen("startComplete") : pending ? t("generating") : t("submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
