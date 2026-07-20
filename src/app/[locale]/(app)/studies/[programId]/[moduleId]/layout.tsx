import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { eq } from "drizzle-orm"
import { Link } from "@/i18n/navigation"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { studyModule } from "@/db/schema"
import { getSession, requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { enabledTools } from "@/config/module-tabs"
import { formatGrade, moduleGrade } from "@/lib/grades"
import { hasGoal } from "@/lib/studies/goals"
import { PageContextSetter } from "@/components/ai/page-context"
import { ModuleTabs } from "@/components/studies/module-tabs"
import { Badge } from "@/components/ui/badge"

const statusVariant = {
  planned: "outline",
  active: "secondary",
  passed: "default",
  failed: "destructive",
} as const

/**
 * Names the tab after the module. This is the segment where it matters most:
 * students keep several modules open at once, and every tab used to read
 * "StudyHelper". Ownership is re-checked in the layout below — this lookup only
 * decides a title, so it deliberately doesn't 404 on its own.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ moduleId: string }>
}): Promise<Metadata> {
  const { moduleId } = await params
  const session = await getSession()
  if (!session) return {}
  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    columns: { name: true },
    with: { semester: { with: { program: { columns: { userId: true } } } } },
  })
  if (!mod || mod.semester.program.userId !== session.user.id) return {}
  return { title: mod.name }
}

export default async function ModuleWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies")

  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      semester: { with: { program: true } },
      grades: true,
      goals: { columns: { type: true } },
    },
  })
  if (
    !mod ||
    mod.semester.program.userId !== session.user.id ||
    mod.semester.programId !== programId
  ) {
    notFound()
  }

  const statusLabels = {
    planned: t("module.statusPlanned"),
    active: t("module.statusActive"),
    passed: t("module.statusPassed"),
    failed: t("module.statusFailed"),
  } as const
  const grade = moduleGrade(mod.grades)
  const aiAvailable = await isAiAvailable()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <PageContextSetter moduleId={mod.id} moduleName={mod.name} />
      <div>
        <nav className="text-muted-foreground flex items-center gap-1 text-xs">
          <Link href="/" className="hover:text-foreground transition-colors">
            {mod.semester.program.name}
          </Link>
          <ChevronRight className="size-3" />
          <Link href="/" className="hover:text-foreground transition-colors">
            {mod.semester.name}
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{mod.name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {mod.name}
            {mod.code && <span className="text-muted-foreground ml-2 text-base">{mod.code}</span>}
          </h1>
          <Badge variant={statusVariant[mod.status]}>{statusLabels[mod.status]}</Badge>
          {mod.ects != null && (
            <span className="text-muted-foreground text-sm">
              {mod.ects} {t("stats.ects")}
            </span>
          )}
          {grade != null && (
            <span className="text-sm font-medium">
              {t("grades.final")}: {formatGrade(grade, mod.semester.program.gradingSystem)}
            </span>
          )}
        </div>
      </div>
      <ModuleTabs
        basePath={`/studies/${programId}/${moduleId}`}
        aiAvailable={aiAvailable}
        enabledTools={enabledTools(
          mod.goals.map((g) => g.type),
          mod.toolOverrides
        )}
        hasThesisGoal={hasGoal(mod.goals, "thesis")}
        moduleId={moduleId}
      />
      {children}
    </div>
  )
}
