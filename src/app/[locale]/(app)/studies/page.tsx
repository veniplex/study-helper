import type { Metadata } from "next"
import { asc, eq } from "drizzle-orm"
import { GraduationCap } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { degreeProgram } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { earnedEcts, formatGrade, programAverage } from "@/lib/grades"
import { Link } from "@/i18n/navigation"
import { ProgramDialog } from "@/components/studies/program-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav")
  return { title: t("studies") }
}

export default async function StudiesPage() {
  const session = await requireSession()
  const t = await getTranslations("studies")

  const programs = await db.query.degreeProgram.findMany({
    where: eq(degreeProgram.userId, session.user.id),
    orderBy: [asc(degreeProgram.sortOrder), asc(degreeProgram.createdAt)],
    with: {
      semesters: {
        with: { modules: { with: { grades: true } } },
      },
    },
  })

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <ProgramDialog />
      </div>

      {programs.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <GraduationCap className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((program) => {
            const modules = program.semesters.flatMap((s) => s.modules)
            const ects = earnedEcts(modules)
            const avg = programAverage(modules)
            return (
              <Link key={program.id} href={`/studies/${program.id}/settings`} className="group">
                <Card className="transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{program.name}</CardTitle>
                    <CardDescription>
                      {[program.degreeType, program.institution].filter(Boolean).join(" · ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">{t("stats.ects")}</dt>
                        <dd className="font-medium">
                          {ects}
                          {program.targetEcts ? ` / ${program.targetEcts}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("stats.average")}</dt>
                        <dd className="font-medium">{formatGrade(avg, program.gradingSystem)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("stats.modules")}</dt>
                        <dd className="font-medium">{modules.length}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
