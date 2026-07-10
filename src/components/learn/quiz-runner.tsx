"use client"

import * as React from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { submitAttempt, type AttemptResult } from "@/app/[locale]/(app)/quiz-actions"
import { cn } from "@/lib/utils"

export type RunnerQuestion = {
  id: string
  kind: "multiple_choice" | "free_text"
  prompt: string
  options: string[] | null
}

export function QuizRunner({
  quizId,
  questions,
}: {
  quizId: string
  questions: RunnerQuestion[]
}) {
  const t = useTranslations("learn.quizzes")
  const router = useRouter()
  const [index, setIndex] = React.useState(0)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [grading, setGrading] = React.useState(false)
  const [result, setResult] = React.useState<AttemptResult | null>(null)

  const current = questions[index]
  const isLast = index === questions.length - 1
  const answered = current ? (answers[current.id] ?? "") !== "" : false

  async function finish() {
    setGrading(true)
    try {
      const res = await submitAttempt({
        quizId,
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
      })
      setResult(res)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setGrading(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("result", { score: result.score })}</h2>
        <ul className="space-y-3">
          {result.results.map((r, i) => (
            <li key={r.questionId} className="space-y-1.5 rounded-md border p-3 text-sm">
              <div className="flex items-start gap-2">
                {r.correct ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                )}
                <span className="font-medium">
                  {i + 1}. {r.prompt}
                </span>
              </div>
              <p className="text-muted-foreground pl-6">
                {t("yourAnswer")}: {r.answer || "–"}
                {r.feedback && ` — ${r.feedback}`}
              </p>
              {r.explanation && (
                <p className="text-muted-foreground pl-6 text-xs">
                  {t("explanation")}: {r.explanation}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-muted-foreground text-center text-xs">
        {t("question", { current: index + 1, total: questions.length })}
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base leading-relaxed">{current.prompt}</CardTitle>
        </CardHeader>
        <CardContent>
          {current.kind === "multiple_choice" && current.options ? (
            <div className="grid gap-2">
              {current.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [current.id]: String(i) }))}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                    answers[current.id] === String(i)
                      ? "border-primary bg-primary/10 font-medium"
                      : "hover:bg-muted"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <Textarea
              rows={4}
              placeholder={t("freeTextPlaceholder")}
              value={answers[current.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))}
            />
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        {isLast ? (
          <Button onClick={finish} disabled={!answered || grading}>
            {grading && <Loader2 className="size-4 animate-spin" />}
            {grading ? t("grading") : t("finish")}
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)} disabled={!answered}>
            {t("next")}
          </Button>
        )}
      </div>
    </div>
  )
}
