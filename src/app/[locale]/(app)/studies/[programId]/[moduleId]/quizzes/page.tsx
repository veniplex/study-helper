import { and, desc, eq } from "drizzle-orm"
import { Sparkles } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { quiz } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { ownModule } from "@/lib/studies/access"
import { Link } from "@/i18n/navigation"
import { deleteQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { GenerateQuizDialog, QuizDialog } from "@/components/learn/quiz-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"

export default async function ModuleQuizzesPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("learn.quizzes")
  const basePath = `/studies/${programId}/${moduleId}`
  const modules = [{ id: mod.id, name: mod.name }]

  const [quizzes, { defaultModel }] = await Promise.all([
    db.query.quiz.findMany({
      where: and(eq(quiz.userId, session.user.id), eq(quiz.moduleId, moduleId)),
      orderBy: [desc(quiz.updatedAt)],
      with: { questions: { columns: { id: true } }, attempts: true },
    }),
    listAvailableModels(),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <QuizDialog modules={modules} fixedModuleId={mod.id} basePath={basePath} />
        <GenerateQuizDialog
          modules={modules}
          aiAvailable={Boolean(defaultModel)}
          fixedModuleId={mod.id}
          basePath={basePath}
        />
      </div>
      {quizzes.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {quizzes.map((q) => {
            const finished = q.attempts.filter((a) => a.finishedAt)
            const best = finished.reduce((max, a) => Math.max(max, Number(a.score ?? 0)), 0)
            return (
              <li
                key={q.id}
                className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
              >
                <Link
                  href={`${basePath}/quizzes/${q.id}`}
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {q.title}
                </Link>
                {q.aiGenerated && (
                  <Badge variant="secondary">
                    <Sparkles className="size-3" />
                    {t("aiBadge")}
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">
                  {t("questions", { count: q.questions.length })}
                  {finished.length > 0 &&
                    ` · ${t("attempts", { count: finished.length })} · ${t("bestScore", { score: best })}`}
                </span>
                <DeleteButton action={deleteQuiz.bind(null, q.id)} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
