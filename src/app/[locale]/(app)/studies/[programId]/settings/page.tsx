import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { requireSession } from "@/lib/auth/session"
import { ownProgram } from "@/lib/studies/access"
import { Link } from "@/i18n/navigation"
import { GradeScaleEditor } from "@/components/learn/grade-scale-editor"
import { ProgramDialog } from "@/components/studies/program-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function ProgramSettingsPage({
  params,
}: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies.programSettings")

  let program
  try {
    program = await ownProgram(programId, session.user.id)
  } catch {
    notFound()
  }

  const gradingLabelKey = {
    german: "program.gradingGerman",
    points: "program.gradingPoints",
    passfail: "program.gradingPassfail",
  } as const
  const tStudies = await getTranslations("studies")

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/studies/${programId}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </div>

      <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("meta")}</CardTitle>
          <ProgramDialog
            program={{
              id: program.id,
              name: program.name,
              degreeType: program.degreeType,
              institution: program.institution,
              targetEcts: program.targetEcts,
              gradingSystem: program.gradingSystem,
            }}
          />
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("name")}</dt>
            <dd className="font-medium">{program.name}</dd>
            <dt className="text-muted-foreground">{t("degreeType")}</dt>
            <dd>{program.degreeType ?? "–"}</dd>
            <dt className="text-muted-foreground">{t("institution")}</dt>
            <dd>{program.institution ?? "–"}</dd>
            <dt className="text-muted-foreground">{t("targetEcts")}</dt>
            <dd>{program.targetEcts ?? "–"}</dd>
            <dt className="text-muted-foreground">{t("gradingSystem")}</dt>
            <dd>{tStudies(gradingLabelKey[program.gradingSystem])}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("gradeScale")}</CardTitle>
        </CardHeader>
        <CardContent>
          <GradeScaleEditor programId={program.id} initialScale={program.gradeScale} />
        </CardContent>
      </Card>
    </div>
  )
}
