"use client"

import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Badge } from "@/components/ui/badge"
import { deleteTask, toggleTask } from "@/app/[locale]/(app)/learn-actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { enqueue, isNetworkError } from "@/lib/offline/outbox"
import { cn } from "@/lib/utils"

export function TaskRow({
  task,
  children,
}: {
  task: {
    id: string
    title: string
    notes: string | null
    priority: "low" | "medium" | "high"
    status: "open" | "doing" | "done"
    dueDate: string | null
    moduleName?: string | null
  }
  children?: React.ReactNode
}) {
  const t = useTranslations("learn.tasks")
  const router = useRouter()
  const done = task.status === "done"

  async function onToggle() {
    try {
      await toggleTask(task.id, !done)
      router.refresh()
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueue("toggle-task", { taskId: task.id, done: !done })
        return
      }
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const priorityVariant = { low: "outline", medium: "secondary", high: "destructive" } as const
  const priorityLabel = {
    low: t("priorityLow"),
    medium: t("priorityMedium"),
    high: t("priorityHigh"),
  } as const

  return (
    <li className="rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="accent-primary size-4 cursor-pointer"
        />
        <span className={cn("font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        <Badge variant={priorityVariant[task.priority]}>{priorityLabel[task.priority]}</Badge>
        {task.moduleName && <Badge variant="secondary">{task.moduleName}</Badge>}
        {task.dueDate && (
          <span className="text-muted-foreground text-xs">{task.dueDate}</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {children}
          <DeleteButton action={deleteTask.bind(null, task.id)} />
        </span>
      </div>
      {task.notes && (
        <p className="text-muted-foreground mt-1 pl-6.5 text-xs whitespace-pre-wrap">
          {task.notes}
        </p>
      )}
    </li>
  )
}
