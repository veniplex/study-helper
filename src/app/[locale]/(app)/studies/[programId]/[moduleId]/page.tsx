import { notFound } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { ExternalLink, KeyRound } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { externalResource, studyModule } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { decrypt } from "@/lib/crypto"
import { formatGrade, moduleGrade } from "@/lib/grades"
import { deleteGrade, deleteResource } from "@/app/[locale]/(app)/studies/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { GradeDialog } from "@/components/studies/grade-dialog"
import { ResourceDialog } from "@/components/studies/resource-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ModulePage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies")
  const format = await getFormatter()

  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      semester: { with: { program: true } },
      grades: { orderBy: (g) => [asc(g.attempt), asc(g.createdAt)] },
    },
  })
  if (!mod || mod.semester.program.userId !== session.user.id || mod.semester.programId !== programId) {
    notFound()
  }

  const resources = await db.query.externalResource.findMany({
    where: eq(externalResource.moduleId, moduleId),
    orderBy: (r) => [asc(r.createdAt)],
  })

  const gradingSystem = mod.semester.program.gradingSystem
  const finalGrade = moduleGrade(mod.grades)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {mod.semester.program.name} · {mod.semester.name}
        </p>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          {mod.name}
          {mod.code && <span className="text-muted-foreground ml-2 text-base">{mod.code}</span>}
        </h1>
        <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {mod.ects != null && (
            <span>
              {mod.ects} {t("stats.ects")}
            </span>
          )}
          {mod.instructor && <span>{mod.instructor}</span>}
          {mod.examType && <span>{mod.examType}</span>}
        </div>
        {mod.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{mod.notes}</p>}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("grades.title")}</CardTitle>
            {finalGrade != null && (
              <CardDescription>
                {t("grades.final")}: <strong>{formatGrade(finalGrade, gradingSystem)}</strong>
              </CardDescription>
            )}
          </div>
          <GradeDialog moduleId={mod.id} />
        </CardHeader>
        <CardContent>
          {mod.grades.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("grades.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">{t("grades.value")}</th>
                    <th className="py-2 pr-4 font-medium">{t("grades.weight")}</th>
                    <th className="py-2 pr-4 font-medium">{t("grades.attempt")}</th>
                    <th className="py-2 pr-4 font-medium">{t("grades.date")}</th>
                    <th className="py-2 pr-4 font-medium">{t("grades.note")}</th>
                    <th className="py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {mod.grades.map((g) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">
                        {formatGrade(Number(g.value), gradingSystem)}
                      </td>
                      <td className="py-2.5 pr-4">{Number(g.weight)}</td>
                      <td className="py-2.5 pr-4">{g.attempt}</td>
                      <td className="py-2.5 pr-4">
                        {g.gradedAt
                          ? format.dateTime(new Date(g.gradedAt), { dateStyle: "medium" })
                          : "–"}
                      </td>
                      <td className="text-muted-foreground py-2.5 pr-4">{g.note ?? ""}</td>
                      <td className="py-2.5 text-right">
                        <DeleteButton action={deleteGrade.bind(null, g.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("resources.title")}</CardTitle>
            <CardDescription>{t("resources.description")}</CardDescription>
          </div>
          <ResourceDialog moduleId={mod.id} />
        </CardHeader>
        <CardContent>
          {resources.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("resources.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {resources.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Badge variant="secondary">{t(`resources.types.${r.type}`)}</Badge>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    {r.name}
                    <ExternalLink className="size-3" />
                  </a>
                  {r.username && (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <KeyRound className="size-3" />
                      {r.username}
                    </span>
                  )}
                  {r.encryptedNote && (
                    <span className="text-muted-foreground text-xs">{decrypt(r.encryptedNote)}</span>
                  )}
                  <span className="ml-auto">
                    <DeleteButton action={deleteResource.bind(null, r.id)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
