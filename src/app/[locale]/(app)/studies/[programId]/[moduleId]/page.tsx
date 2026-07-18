import { notFound } from "next/navigation"
import { asc, eq } from "drizzle-orm"
import { ExternalLink, KeyRound } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { externalResource, moduleContact, studyModule } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { decrypt } from "@/lib/crypto"
import { getModuleFinalGrade } from "@/lib/studies/grades-server"
import { getModuleStats } from "@/lib/learning/stats-server"
import { deleteResource } from "@/app/[locale]/(app)/studies/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { ResourceDialog } from "@/components/studies/resource-dialog"
import { AnalyzeButton } from "@/components/learn/analyze-button"
import { ModuleAssessmentCard } from "@/components/learn/module-assessment-card"
import { ModuleContactsCard } from "@/components/learn/module-contacts-card"
import { SessionStartDialog } from "@/components/learn/session-start-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function ModuleOverviewPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { programId, moduleId } = await params
  const session = await requireSession()
  const t = await getTranslations("studies")

  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      semester: { with: { program: true } },
      grades: { orderBy: (g) => [asc(g.attempt), asc(g.createdAt)] },
      assessment: { with: { attempts: { orderBy: (a) => [asc(a.attempt)] } } },
    },
  })
  if (
    !mod ||
    mod.semester.program.userId !== session.user.id ||
    mod.semester.programId !== programId
  ) {
    notFound()
  }

  const gradingSystem = mod.semester.program.gradingSystem
  // Independent lookups — fetch them concurrently to keep TTFB low.
  const [resources, contacts, finalGrade, stats, aiAvailable, tStats, decks, quizzes] =
    await Promise.all([
      db.query.externalResource.findMany({
        where: eq(externalResource.moduleId, moduleId),
        orderBy: (r) => [asc(r.createdAt)],
      }),
      db.query.moduleContact.findMany({
        where: eq(moduleContact.moduleId, moduleId),
        orderBy: (c) => [asc(c.sortOrder), asc(c.createdAt)],
      }),
      getModuleFinalGrade(moduleId),
      getModuleStats(session.user.id, moduleId),
      isAiAvailable(),
      getTranslations("stats"),
      db.query.deck.findMany({
        where: (d, { and: a, eq: e }) =>
          a(e(d.userId, session.user.id), e(d.moduleId, moduleId)),
        columns: { id: true, name: true },
      }),
      db.query.quiz.findMany({
        where: (q, { and: a, eq: e }) =>
          a(e(q.userId, session.user.id), e(q.moduleId, moduleId)),
        columns: { id: true, title: true },
      }),
    ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        {aiAvailable && <AnalyzeButton moduleId={moduleId} />}
        <SessionStartDialog
          basePath={`/studies/${programId}/${moduleId}`}
          moduleId={moduleId}
          decks={decks}
          quizzes={quizzes}
        />
      </div>
      <dl className="grid grid-cols-3 gap-4">
        {[
          [tStats("dueCards"), String(stats.dueCards)],
          [
            tStats("lastQuizScore"),
            stats.lastQuizScore != null ? `${stats.lastQuizScore}%` : "–",
          ],
          [
            tStats("studyTime"),
            `${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`,
          ],
        ].map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>
      {(mod.instructor || mod.examType || mod.notes) && (
        <div>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {mod.instructor && <span>{mod.instructor}</span>}
            {mod.examType && <span>{mod.examType}</span>}
          </div>
          {mod.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{mod.notes}</p>}
        </div>
      )}

      {finalGrade && (
        <ModuleAssessmentCard
          moduleId={mod.id}
          assessmentType={mod.assessment?.type ?? (mod.isThesis ? "term_paper" : "exam")}
          maxAttempts={mod.maxAttempts}
          passFail={mod.passFail}
          gradingSystem={gradingSystem}
          attempts={(mod.assessment?.attempts ?? []).map((a) => ({
            id: a.id,
            attempt: a.attempt,
            resultPercent: a.resultPercent,
            date: a.date,
            passed: a.passed,
            note: a.note,
          }))}
          final={finalGrade}
          legacyGrades={mod.grades.map((g) => ({
            id: g.id,
            value: g.value,
            weight: g.weight,
            attempt: g.attempt,
            gradedAt: g.gradedAt,
            note: g.note,
          }))}
          bonusType={mod.bonusType}
          bonusValue={mod.bonusValue}
          bonusMinAvgPercent={mod.bonusMinAvgPercent}
          bonusMinCompletedShare={mod.bonusMinCompletedShare}
        />
      )}

      <ModuleContactsCard moduleId={mod.id} contacts={contacts} />

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
              {resources.map((r) => {
                const note = r.encryptedNote ? decrypt(r.encryptedNote) : null
                return (
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
                    {note && <span className="text-muted-foreground text-xs">{note}</span>}
                    <span className="ml-auto flex items-center gap-1">
                      <ResourceDialog
                        moduleId={mod.id}
                        resource={{
                          id: r.id,
                          type: r.type,
                          name: r.name,
                          url: r.url,
                          username: r.username,
                          note,
                        }}
                      />
                      <DeleteButton action={deleteResource.bind(null, r.id)} />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
