import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { studyTask } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { TaskBoard, type BoardTask } from "@/components/learn/task-board"
import { TaskDialog } from "@/components/learn/task-dialog"

export default async function ModuleTasksPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)

  const tasks = await db.query.studyTask.findMany({
    where: and(eq(studyTask.userId, session.user.id), eq(studyTask.moduleId, moduleId)),
    orderBy: [asc(studyTask.sortOrder), desc(studyTask.priority), asc(studyTask.dueDate)],
  })

  const roots = tasks.filter((task) => !task.parentId)
  const boardTasks: BoardTask[] = roots.map((task) => ({
    id: task.id,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    subtaskCount: tasks.filter((sub) => sub.parentId === task.id).length,
  }))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TaskDialog modules={[{ id: mod.id, name: mod.name }]} fixedModuleId={mod.id} />
      </div>
      <TaskBoard tasks={boardTasks} />
    </div>
  )
}
