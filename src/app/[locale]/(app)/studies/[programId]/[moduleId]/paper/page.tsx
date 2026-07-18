import { notFound } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { moduleGoal, writingMilestone, writingProject } from "@/db/schema"
import type { GoalType } from "@/db/schema/studies"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { isAiAvailable } from "@/lib/ai/registry"
import { ensureModuleWritingProject } from "@/app/[locale]/(app)/studies/writing-actions"
import {
  WritingWorkspace,
  type WritingProjectData,
} from "@/components/writing/writing-workspace"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"

/** Goal types that own a writing project, in resolution priority order. */
const WRITING_GOAL_TYPES: readonly GoalType[] = ["thesis", "term_paper", "project"]

export default async function ModulePaperPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  await ownModule(moduleId, session.user.id)
  const t = await getTranslations("writing")

  const goals = await db.query.moduleGoal.findMany({
    where: eq(moduleGoal.moduleId, moduleId),
  })
  const goal = WRITING_GOAL_TYPES.map((type) => goals.find((g) => g.type === type)).find(
    (g): g is (typeof goals)[number] => Boolean(g)
  )

  if (!goal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">{t("noGoalHint")}</CardContent>
      </Card>
    )
  }

  const projectId = await ensureModuleWritingProject(moduleId)
  const [project, aiAvailable] = await Promise.all([
    db.query.writingProject.findFirst({
      where: eq(writingProject.id, projectId),
      with: { milestones: { orderBy: [asc(writingMilestone.dueDate)] } },
    }),
    isAiAvailable(),
  ])
  if (!project) notFound()

  return (
    <div className="space-y-4">
      {project.kind === "thesis" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t("thesisLinkHint")}</span>
            <Link href="/thesis" className="text-primary font-medium hover:underline">
              {t("openThesisPage")}
            </Link>
          </CardContent>
        </Card>
      )}
      <WritingWorkspace
        project={project as WritingProjectData}
        variant={project.variant}
        kind={project.kind}
        aiAvailable={aiAvailable}
        basePath={`/studies/${programId}/${moduleId}/paper`}
        requiresSources={goal.config.requiresSources ?? false}
      />
    </div>
  )
}
