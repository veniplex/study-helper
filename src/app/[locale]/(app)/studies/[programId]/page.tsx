import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { degreeProgram } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { earnedEcts, formatGrade, moduleGrade, programAverage } from "@/lib/grades"
import { Link } from "@/i18n/navigation"
import {
  deleteModule,
  deleteProgram,
  deleteSemester,
} from "@/app/[locale]/(app)/studies/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { ProgramDialog } from "@/components/studies/program-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const statusVariant = {
  planned: "outline",
  active: "secondary",
  passed: "default",
  failed: "destructive",
} as const

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies")

  const program = await db.query.degreeProgram.findFirst({
    where: and(eq(degreeProgram.id, programId), eq(degreeProgram.userId, session.user.id)),
    with: {
      semesters: {
        orderBy: (s) => [asc(s.sortOrder), asc(s.createdAt)],
        with: {
          modules: {
            orderBy: (m) => [asc(m.sortOrder), asc(m.createdAt)],
            with: { grades: true },
          },
        },
      },
    },
  })
  if (!program) notFound()

  const allModules = program.semesters.flatMap((s) => s.modules)
  const statusLabels = {
    planned: t("module.statusPlanned"),
    active: t("module.statusActive"),
    passed: t("module.statusPassed"),
    failed: t("module.statusFailed"),
  } as const

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{program.name}</h1>
          <p className="text-muted-foreground text-sm">
            {[program.degreeType, program.institution].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ProgramDialog program={program} />
          <DeleteButton action={deleteProgram.bind(null, program.id)} redirectTo="/studies" />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          [
            t("stats.ects"),
            `${earnedEcts(allModules)}${program.targetEcts ? ` / ${program.targetEcts}` : ""}`,
          ],
          [t("stats.average"), formatGrade(programAverage(allModules), program.gradingSystem)],
          [t("stats.modules"), String(allModules.length)],
          [t("stats.semesters"), String(program.semesters.length)],
        ].map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>

      <div className="flex justify-end">
        <SemesterDialog programId={program.id} />
      </div>

      {program.semesters.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("semester.empty")}</p>
      ) : (
        program.semesters.map((sem) => (
          <Card key={sem.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{sem.name}</CardTitle>
              <div className="flex items-center gap-1">
                <ModuleDialog semesterId={sem.id} />
                <SemesterDialog programId={program.id} semester={sem} />
                <DeleteButton action={deleteSemester.bind(null, sem.id)} />
              </div>
            </CardHeader>
            <CardContent>
              {sem.modules.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("module.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="py-2 pr-4 font-medium">{t("module.name")}</th>
                        <th className="py-2 pr-4 font-medium">{t("module.ects")}</th>
                        <th className="py-2 pr-4 font-medium">{t("module.grade")}</th>
                        <th className="py-2 pr-4 font-medium">{t("module.status")}</th>
                        <th className="py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sem.modules.map((mod) => (
                        <tr key={mod.id} className="border-b last:border-0">
                          <td className="py-2.5 pr-4">
                            <Link
                              href={`/studies/${program.id}/${mod.id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {mod.name}
                            </Link>
                            {mod.code && (
                              <span className="text-muted-foreground ml-2 text-xs">
                                {mod.code}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">{mod.ects ?? "–"}</td>
                          <td className="py-2.5 pr-4">
                            {formatGrade(moduleGrade(mod.grades), program.gradingSystem)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant={statusVariant[mod.status]}>
                              {statusLabels[mod.status]}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <ModuleDialog semesterId={sem.id} module={mod} />
                              <DeleteButton action={deleteModule.bind(null, mod.id)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
