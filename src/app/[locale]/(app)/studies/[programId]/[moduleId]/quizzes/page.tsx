import * as React from "react"
import { and, desc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { quiz } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { ownModule } from "@/lib/studies/access"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { QuizCard } from "@/components/learn/quiz-card"
import { GenerateQuizDialog, QuizDialog } from "@/components/learn/quiz-dialogs"
import { EmptyState } from "@/components/ui/empty-state"
import { ListChecks } from "lucide-react"

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
        <EmptyState icon={ListChecks} title={t("empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => {
            const finished = q.attempts.filter((a) => a.finishedAt)
            const best = finished.reduce((max, a) => Math.max(max, Number(a.score ?? 0)), 0)
            return (
              <QuizCard
                key={q.id}
                quiz={{
                  id: q.id,
                  title: q.title,
                  description: q.description,
                  aiGenerated: q.aiGenerated,
                  questionCount: q.questions.length,
                  finishedCount: finished.length,
                  bestScore: best,
                }}
                basePath={basePath}
                glyph={React.createElement(Icon, { className: "size-5" })}
                colorSoft={color.soft}
                colorText={color.text}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
