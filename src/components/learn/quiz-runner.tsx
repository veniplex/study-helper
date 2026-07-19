"use client"

import * as React from "react"
import { ArrowLeft, CheckCircle2, HelpCircle, Layers, Loader2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
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
  deckLinkBase,
}: {
  quizId: string
  questions: RunnerQuestion[]
  /** `/studies/{programId}/{moduleId}` — used to deep-link the mistakes deck. */
  deckLinkBase?: string
}) {
  const t = useTranslations("learn.quizzes")
  const router = useRouter()
  const [index, setIndex] = React.useState(0)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [grading, setGrading] = React.useState(false)
  const [result, setResult] = React.useState<AttemptResult | null>(null)
  const [startedAt] = React.useState(() => Date.now())

  const current = questions[index]
  const isLast = index === questions.length - 1
  const answered = current ? (answers[current.id] ?? "") !== "" : false
  // Determinate grading hint: how many free-text answers the AI must grade.
  const freeTextCount = questions.filter((q) => q.kind === "free_text").length

  async function finish() {
    setGrading(true)
    try {
      const res = await submitAttempt({
        quizId,
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" })),
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
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
        <h2 className="text-lg font-semibold">
          {result.score != null ? t("result", { score: result.score }) : t("resultNotGraded")}
        </h2>
        {result.mistakesAdded > 0 && (
          <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span>{t("mistakesAdded", { count: result.mistakesAdded })}</span>
            {deckLinkBase && result.mistakesDeckId && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`${deckLinkBase}/decks/${result.mistakesDeckId}`} />}
              >
                <Layers className="size-3.5" />
                {t("openMistakesDeck")}
              </Button>
            )}
          </div>
        )}
        <ul className="space-y-3">
          {result.results.map((r, i) => (
            <li key={r.questionId} className="space-y-1.5 rounded-md border p-3 text-sm">
              <div className="flex items-start gap-2">
                {!r.graded ? (
                  <HelpCircle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                ) : r.correct ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                )}
                <span className="font-medium">
                  {i + 1}. {r.prompt}
                </span>
              </div>
              <p className="text-muted-foreground pl-6">
                {t("yourAnswer")}: {r.answerText || "–"}
                {r.feedback && ` — ${r.feedback}`}
              </p>
              {!r.graded && (
                <p className="text-muted-foreground pl-6 text-xs">{t("notGraded")}</p>
              )}
              {(!r.correct || !r.graded) && r.correctAnswer && (
                <p className="pl-6 text-green-700 dark:text-green-400">
                  {t("correctAnswer")}: {r.correctAnswer}
                </p>
              )}
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
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0 || grading}
        >
          <ArrowLeft className="size-4" />
          {t("previous")}
        </Button>
        <div className="flex gap-2">
          {/* Skip is always allowed; only submit keeps the answered-gating. */}
          {!isLast && (
            <Button variant="outline" onClick={() => setIndex((i) => i + 1)}>
              {answered ? t("next") : t("skip")}
            </Button>
          )}
          {isLast && (
            <Button onClick={finish} disabled={!answered || grading}>
              {grading && <Loader2 className="size-4 animate-spin" />}
              {grading
                ? freeTextCount > 0
                  ? t("gradingCount", { count: freeTextCount })
                  : t("grading")
                : t("finish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
