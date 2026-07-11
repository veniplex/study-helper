import { asc, desc, eq } from "drizzle-orm"
import { GraduationCap } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { thesisMilestone, thesisProject } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { getStudyContext } from "@/lib/studies/context"
import { BrainstormDialog, ThesisCreateDialog } from "@/components/thesis/thesis-create"
import { RetryThesisButton } from "@/components/thesis/retry-thesis-button"
import { ThesisWorkspace, type ThesisData } from "@/components/thesis/thesis-workspace"

export default async function ThesisPage() {
  const session = await requireSession()
  const t = await getTranslations("thesis")

  const [context, { defaultModel }] = await Promise.all([
    getStudyContext(session.user.id),
    listAvailableModels(),
  ])
  const aiAvailable = Boolean(defaultModel)
  const activeProgram = context.activeProgram

  // All theses of the active program (the live one + its superseded history).
  const theses = activeProgram
    ? await db.query.thesisProject.findMany({
        where: eq(thesisProject.programId, activeProgram.id),
        orderBy: [desc(thesisProject.attempt)],
        with: { milestones: { orderBy: [asc(thesisMilestone.dueDate)] } },
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
              {t("attempt", { n: current.attempt })}
            </span>
            <RetryThesisButton thesisId={current.id} />
          </div>
          <ThesisWorkspace
            thesis={current as ThesisData}
            aiAvailable={aiAvailable}
            semesters={semesters}
          />

          {previous.length > 0 && (
            <details className="rounded-lg border p-4">
              <summary className="text-muted-foreground cursor-pointer text-sm font-medium">
                {t("previousAttempts", { count: previous.length })}
              </summary>
              <ul className="mt-3 space-y-2">
                {previous.map((p) => (
                  <li key={p.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {t("attempt", { n: p.attempt })}
                      </span>
                      <span className="font-medium">{p.title}</span>
                    </div>
                    {p.researchQuestion && (
                      <p className="text-muted-foreground mt-1 text-xs italic">
                        {p.researchQuestion}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
