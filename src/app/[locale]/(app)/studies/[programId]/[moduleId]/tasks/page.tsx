import { and, asc, desc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { studyTask } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { TaskDialog } from "@/components/learn/task-dialog"
import { TaskRow } from "@/components/learn/task-row"

export default async function ModuleTasksPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("learn.tasks")
  const modules = [{ id: mod.id, name: mod.name }]

  const tasks = await db.query.studyTask.findMany({
    where: and(eq(studyTask.userId, session.user.id), eq(studyTask.moduleId, moduleId)),
    orderBy: [asc(studyTask.status), desc(studyTask.priority), asc(studyTask.dueDate)],
  })

  const roots = tasks.filter((task) => !task.parentId)
  const childrenOf = (id: string) => tasks.filter((task) => task.parentId === id)
  const open = roots.filter((task) => task.status !== "done")
  const done = roots.filter((task) => task.status === "done")

  function renderTask(task: (typeof tasks)[number]) {
    return (
      <div key={task.id} className="space-y-1.5">
        <ul>
          <TaskRow
            task={{
              id: task.id,
              title: task.title,
              notes: task.notes,
              priority: task.priority,
              status: task.status,
              dueDate: task.dueDate,
            }}
          >
            <TaskDialog modules={modules} parentId={task.id} fixedModuleId={mod.id} />
          </TaskRow>
        </ul>
        {childrenOf(task.id).length > 0 && (
          <ul className="space-y-1.5 pl-6">
            {childrenOf(task.id).map((sub) => (
              <TaskRow
                key={sub.id}
                task={{
                  id: sub.id,
                  title: sub.title,
                  notes: sub.notes,
                  priority: sub.priority,
                  status: sub.status,
                  dueDate: sub.dueDate,
                }}
              />
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TaskDialog modules={modules} fixedModuleId={mod.id} />
      </div>
      {open.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <div className="space-y-1.5">{open.map(renderTask)}</div>
      )}
      {done.length > 0 && (
        <details className="pt-2">
          <summary className="text-muted-foreground cursor-pointer text-sm">
            {t("showDone")} ({done.length})
          </summary>
          <div className="mt-2 space-y-1.5 opacity-70">{done.map(renderTask)}</div>
        </details>
      )}
    </div>
  )
}
