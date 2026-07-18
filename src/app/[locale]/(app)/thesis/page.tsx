import { and, asc, desc, eq } from "drizzle-orm"
import { GraduationCap } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { writingMilestone, writingProject } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { getStudyContext } from "@/lib/studies/context"
import { BrainstormDialog, ThesisCreateDialog } from "@/components/thesis/thesis-create"
import { RetryThesisButton } from "@/components/thesis/retry-thesis-button"
import {
  WritingWorkspace,
  type WritingProjectData,
} from "@/components/writing/writing-workspace"

export default async function ThesisPage() {
  const session = await requireSession()
  const t = await getTranslations("thesis")

  const [context, { defaultModel }] = await Promise.all([
    getStudyContext(session.user.id),
    listAvailableModels(),
  ])
  const aiAvailable = Boolean(defaultModel)
  const activeProgram = context.activeProgram
  const maxAttempts =
    context.programs.length && activeProgram
      ? await db.query.degreeProgram
          .findFirst({
            where: (p, { eq: e }) => e(p.id, activeProgram.id),
            columns: { thesisMaxAttempts: true },
          })
          .then((p) => p?.thesisMaxAttempts ?? 2)
      : 2

  // All theses of the active program (the live one + its superseded history).
  const theses = activeProgram
    ? await db.query.writingProject.findMany({
        where: and(eq(writingProject.programId, activeProgram.id), eq(writingProject.kind, "thesis")),
        orderBy: [desc(writingProject.attempt)],
        with: { milestones: { orderBy: [asc(writingMilestone.dueDate)] } },
      })
    : []
  const current = theses.find((th) => th.supersededById == null) ?? null
  const previous = theses.filter((th) => th.supersededById != null)

  const semesters = context.tree.map((s) => ({
    id: s.id,
    label: `${activeProgram?.name ?? ""} · ${s.name}`,
  }))

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        {!current && activeProgram && (
          <div className="flex gap-2">
            <BrainstormDialog aiAvailable={aiAvailable} programId={activeProgram.id} />
            <ThesisCreateDialog semesters={semesters} programId={activeProgram.id} />
          </div>
        )}
      </div>

      {!activeProgram ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("noProgram")}</p>
      ) : !current ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <GraduationCap className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
              {t("attemptOf", { n: current.attempt, max: maxAttempts })}
            </span>
            {current.attempt < maxAttempts && <RetryThesisButton thesisId={current.id} />}
          </div>
          <WritingWorkspace
            project={current as WritingProjectData}
            variant="scientific"
            kind="thesis"
            aiAvailable={aiAvailable}
            basePath="/thesis"
            semesters={semesters}
          />

          {previous.length > 0 && (
            <details className="rounded-lg border p-4">
              <summary className="text-muted-foreground cursor-pointer text-sm font-medium">
                {t("previousAttempts", { count: previous.length })}
              </summary>
              <div className="mt-4 space-y-6">
                {previous.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                      {t("attempt", { n: p.attempt })}
                    </span>
                    <WritingWorkspace
                      project={p as WritingProjectData}
                      variant="scientific"
                      kind="thesis"
                      aiAvailable={aiAvailable}
                      basePath="/thesis"
                      semesters={semesters}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
