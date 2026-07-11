import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { eq } from "drizzle-orm"
import { Link } from "@/i18n/navigation"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { studyModule } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { formatGrade, moduleGrade } from "@/lib/grades"
import { PageContextSetter } from "@/components/ai/page-context"
import { ModuleTabs } from "@/components/studies/module-tabs"
import { Badge } from "@/components/ui/badge"

const statusVariant = {
  planned: "outline",
  active: "secondary",
  passed: "default",
  failed: "destructive",
} as const

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
    with: { semester: { with: { program: true } }, grades: true },
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
      <ModuleTabs basePath={`/studies/${programId}/${moduleId}`} />
      {children}
    </div>
  )
}
