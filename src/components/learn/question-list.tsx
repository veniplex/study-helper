"use client"

import * as React from "react"
import { Loader2, Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deleteQuestion, updateQuestion } from "@/app/[locale]/(app)/quiz-actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type QuestionItem = {
  id: string
  kind: "multiple_choice" | "free_text"
  prompt: string
  options: string[] | null
  correctIndex: number | null
  referenceAnswer: string | null
  explanation: string | null
}

function EditQuestionDialog({
  question,
  open,
  onOpenChange,
}: {
  question: QuestionItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("learn.questionForm")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [options, setOptions] = React.useState<string[]>(
    question.options ?? ["", "", "", ""]
  )
  const [correctIndex, setCorrectIndex] = React.useState(question.correctIndex ?? 0)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload =
      question.kind === "multiple_choice"
        ? {
            kind: "multiple_choice" as const,
            prompt: String(form.get("prompt")),
            options: options.filter((o) => o.trim()),
            correctIndex,
            explanation: String(form.get("explanation") || "") || null,
          }
        : {
            kind: "free_text" as const,
            prompt: String(form.get("prompt")),
            referenceAnswer: String(form.get("referenceAnswer")),
            explanation: String(form.get("explanation") || "") || null,
          }
    setPending(true)
    try {
      await updateQuestion(question.id, payload)
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="eq-prompt">{t("prompt")}</Label>
            <Textarea id="eq-prompt" name="prompt" rows={2} defaultValue={question.prompt} required />
          </div>
          {question.kind === "multiple_choice" ? (
            <div className="space-y-1.5">
              <Label>{t("options")}</Label>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="eq-correct"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    aria-label={t("correct")}
                  />
                  <Input
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="eq-ref">{t("referenceAnswer")}</Label>
              <Textarea
                id="eq-ref"
                name="referenceAnswer"
                rows={2}
                defaultValue={question.referenceAnswer ?? ""}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="eq-expl">{t("explanation")}</Label>
            <Textarea
              id="eq-expl"
              name="explanation"
              rows={2}
              defaultValue={question.explanation ?? ""}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

export function QuestionList({ questions }: { questions: QuestionItem[] }) {
  const tForm = useTranslations("learn.questionForm")
  const tCommon = useTranslations("common")
  const [editing, setEditing] = React.useState<string | null>(null)

  if (questions.length === 0) return null

  return (
    <ul className="space-y-1.5">
      {questions.map((q, i) => (
        <li key={q.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{q.prompt}</span>
          <Badge variant="outline">
            {q.kind === "multiple_choice" ? tForm("mc") : tForm("freeText")}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            title={tCommon("edit")}
            onClick={() => setEditing(q.id)}
          >
            <Pencil className="size-3.5" />
            <span className="sr-only">{tCommon("edit")}</span>
          </Button>
          <DeleteButton action={deleteQuestion.bind(null, q.id)} />
          <EditQuestionDialog
            question={q}
            open={editing === q.id}
            onOpenChange={(v) => setEditing(v ? q.id : null)}
          />
        </li>
      ))}
    </ul>
  )
}
