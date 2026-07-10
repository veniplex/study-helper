import { notFound } from "next/navigation"
import { and, asc, desc, eq } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { question, quiz, quizAttempt } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { Link } from "@/i18n/navigation"
import { QuestionForm } from "@/components/learn/question-form"
import { QuizRunner, type RunnerQuestion } from "@/components/learn/quiz-runner"
import { Button } from "@/components/ui/button"

export default async function ModuleQuizDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string; moduleId: string; quizId: string }>
  searchParams: Promise<{ run?: string; wrong?: string }>
}) {
  const { programId, moduleId, quizId } = await params
  const { run, wrong } = await searchParams
  const session = await requireSession()
  const t = await getTranslations("learn.quizzes")
  const format = await getFormatter()
  const basePath = `/studies/${programId}/${moduleId}`

  const quizRow = await db.query.quiz.findFirst({
    where: and(eq(quiz.id, quizId), eq(quiz.userId, session.user.id)),
    with: { questions: { orderBy: [asc(question.sortOrder)] } },
  })
  if (!quizRow || quizRow.moduleId !== moduleId) notFound()

  if (run) {
    let selectedQuestions = quizRow.questions
    if (wrong) {
      const latest = await db.query.quizAttempt.findFirst({
        where: and(eq(quizAttempt.quizId, quizId), eq(quizAttempt.userId, session.user.id)),
        orderBy: [desc(quizAttempt.startedAt)],
        with: { answers: true },
      })
      const wrongIds =
        latest?.answers.filter((a) => a.correct === false).map((a) => a.questionId) ?? []
      if (wrongIds.length > 0) {
        selectedQuestions = quizRow.questions.filter((q) => wrongIds.includes(q.id))
      }
    }
    const runnerQuestions: RunnerQuestion[] = selectedQuestions.map((q) => ({
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      options: q.options,
    }))
    return <QuizRunner quizId={quizId} questions={runnerQuestions} />
  }

  const attempts = await db.query.quizAttempt.findMany({
    where: and(eq(quizAttempt.quizId, quizId), eq(quizAttempt.userId, session.user.id)),
    orderBy: [desc(quizAttempt.startedAt)],
    limit: 20,
  })
  const finished = attempts.filter((a) => a.finishedAt)
  const hasWrong = finished.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{quizRow.title}</h2>
        {quizRow.questions.length > 0 && (
          <>
            <Button
              nativeButton={false}
              render={<Link href={`${basePath}/quizzes/${quizId}?run=1`} />}
            >
              {t("start")}
            </Button>
            {hasWrong && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`${basePath}/quizzes/${quizId}?run=1&wrong=1`} />}
              >
                {t("retryWrong")}
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-muted-foreground text-sm">
        {t("questions", { count: quizRow.questions.length })}
      </p>

      <QuestionForm quizId={quizId} />

      {finished.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("history")}</h3>
          <ul className="space-y-1.5">
            {finished.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-semibold tabular-nums">{Number(a.score ?? 0)}%</span>
                <span className="text-muted-foreground text-xs">
                  {format.dateTime(a.startedAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
