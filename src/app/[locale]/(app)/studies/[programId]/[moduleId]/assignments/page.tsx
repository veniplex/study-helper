import { and, asc, desc, eq } from "drizzle-orm"
import { CalendarDays, FileText } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { assignment, material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { deleteAssignment } from "@/app/[locale]/(app)/assignment-actions"
import { AssignmentDialog } from "@/components/learn/assignment-dialog"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"

const statusVariant = { open: "outline", submitted: "secondary", graded: "default" } as const

export default async function ModuleAssignmentsPage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("assignments")
  const format = await getFormatter()

  const [assignments, materials] = await Promise.all([
    db.query.assignment.findMany({
      where: and(eq(assignment.userId, session.user.id), eq(assignment.moduleId, moduleId)),
      orderBy: [asc(assignment.dueDate), desc(assignment.createdAt)],
      with: { materials: { with: { material: { columns: { id: true, name: true } } } } },
    }),
    db.query.material.findMany({
      where: and(eq(material.userId, session.user.id), eq(material.moduleId, moduleId)),
      columns: { id: true, name: true },
      orderBy: [desc(material.createdAt)],
    }),
  ])

  const now = new Date()
  void mod

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AssignmentDialog moduleId={moduleId} materials={materials} />
      </div>

      {assignments.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const overdue =
              a.status === "open" && a.dueDate != null && new Date(a.dueDate) < now
            return (
              <li key={a.id} className="space-y-1.5 rounded-md border px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[a.status]}>{t(`status.${a.status}`)}</Badge>
                  {a.kind === "practice" && (
                    <Badge variant="outline">{t("kind.practice")}</Badge>
                  )}
                  <span className="font-medium">{a.title}</span>
                  {a.pointsMax != null && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {a.pointsAchieved ?? "–"} / {a.pointsMax} {t("points")}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    {a.dueDate && (
                      <span
                        className={
                          overdue
                            ? "text-destructive flex items-center gap-1 text-xs font-medium"
                            : "text-muted-foreground flex items-center gap-1 text-xs"
                        }
                      >
                        <CalendarDays className="size-3" />
                        {format.dateTime(new Date(a.dueDate), { dateStyle: "medium" })}
                      </span>
                    )}
                    <AssignmentDialog
                      moduleId={moduleId}
                      materials={materials}
                      assignment={{
                        id: a.id,
                        title: a.title,
                        description: a.description,
                        dueDate: a.dueDate,
                        status: a.status,
                        kind: a.kind,
                        pointsAchieved: a.pointsAchieved,
                        pointsMax: a.pointsMax,
                        materialIds: a.materials.map((m) => m.material.id),
                      }}
                    />
                    <DeleteButton action={deleteAssignment.bind(null, a.id)} />
                  </span>
                </div>
                {a.description && (
                  <p className="text-muted-foreground text-xs">{a.description}</p>
                )}
                {a.materials.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {a.materials.map((m) => (
                      <Badge key={m.material.id} variant="outline" className="gap-1">
                        <FileText className="size-3" />
                        {m.material.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
