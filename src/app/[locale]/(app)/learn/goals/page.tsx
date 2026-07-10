import { asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { learningGoal } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getModuleOptions } from "@/lib/studies/module-options"
import { GoalCard } from "@/components/learn/goal-card"
import { GoalDialog } from "@/components/learn/goal-dialog"

export default async function GoalsPage() {
  const session = await requireSession()
  const t = await getTranslations("learn.goals")

  const [goals, modules] = await Promise.all([
    db.query.learningGoal.findMany({
      where: eq(learningGoal.userId, session.user.id),
      orderBy: [asc(learningGoal.targetDate), asc(learningGoal.createdAt)],
      with: { module: true },
    }),
    getModuleOptions(session.user.id),
  ])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GoalDialog modules={modules} />
      </div>
      {goals.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={{
                id: g.id,
                title: g.title,
                description: g.description,
                progress: g.progress,
                targetDate: g.targetDate,
                moduleName: g.module?.name ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
