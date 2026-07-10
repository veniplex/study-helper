import { asc, desc, eq } from "drizzle-orm"
import { GraduationCap } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { thesisMilestone, thesisProject } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { BrainstormDialog, ThesisCreateDialog } from "@/components/thesis/thesis-create"
import { ThesisWorkspace, type ThesisData } from "@/components/thesis/thesis-workspace"

export default async function ThesisPage() {
  const session = await requireSession()
  const t = await getTranslations("thesis")

  const [projects, { defaultModel }, programs] = await Promise.all([
    db.query.thesisProject.findMany({
      where: eq(thesisProject.userId, session.user.id),
      orderBy: [desc(thesisProject.updatedAt)],
      with: { milestones: { orderBy: [asc(thesisMilestone.dueDate)] } },
    }),
    listAvailableModels(),
    db.query.degreeProgram.findMany({
      where: (p, { eq }) => eq(p.userId, session.user.id),
      with: { semesters: { columns: { id: true, name: true } } },
    }),
  ])
  const aiAvailable = Boolean(defaultModel)
  const semesters = programs.flatMap((p) =>
    p.semesters.map((s) => ({ id: s.id, label: `${p.name} · ${s.name}` }))
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex gap-2">
          <BrainstormDialog aiAvailable={aiAvailable} />
          <ThesisCreateDialog semesters={semesters} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <GraduationCap className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
      ) : (
        projects.map((p) => (
          <ThesisWorkspace
            key={p.id}
            thesis={p as ThesisData}
            aiAvailable={aiAvailable}
            semesters={semesters}
          />
        ))
      )}
    </div>
  )
}
