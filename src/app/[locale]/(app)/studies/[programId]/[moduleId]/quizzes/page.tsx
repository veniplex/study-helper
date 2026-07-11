import * as React from "react"
import { and, desc, eq } from "drizzle-orm"
import { HelpCircle, Play } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { quiz } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { ownModule } from "@/lib/studies/access"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { Link } from "@/i18n/navigation"
import { deleteQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { GenerateQuizDialog, QuizDialog } from "@/components/learn/quiz-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
  const color = getModuleColorClasses(mod.color)
  const Icon = getModuleIcon(mod.icon)

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => {
            const finished = q.attempts.filter((a) => a.finishedAt)
            const best = finished.reduce((max, a) => Math.max(max, Number(a.score ?? 0)), 0)
            return (
              <div key={q.id} className="bg-card flex flex-col rounded-xl border p-4">
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      color.soft,
                      color.text
                    )}
                  >
                    {React.createElement(Icon, { className: "size-5" })}
                  </span>
                  <Link
                    href={`${basePath}/quizzes/${q.id}`}
                    className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
                  >
                    {q.title}
                  </Link>
                  {q.aiGenerated && <AiBadge iconOnly />}
                </div>
                {q.description && (
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{q.description}</p>
                )}
                <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
                  <HelpCircle className="size-3.5" />
                  {t("questions", { count: q.questions.length })}
                  {finished.length > 0 && (
                    <span className="ml-auto tabular-nums">{t("bestScore", { score: best })}</span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={q.questions.length === 0}
                    nativeButton={false}
                    render={<Link href={`${basePath}/quizzes/${q.id}?run=1`} />}
                  >
                    <Play className="size-4" />
                    {t("start")}
                  </Button>
                  <DeleteButton action={deleteQuiz.bind(null, q.id)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
