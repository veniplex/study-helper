"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CalendarDays, GripVertical } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  deleteTask,
  reorderTasks,
  updateTaskStatus,
} from "@/app/[locale]/(app)/learn-actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TaskStatus } from "@/db/schema"

export type BoardTask = {
  id: string
  title: string
  notes: string | null
  priority: "low" | "medium" | "high"
  status: TaskStatus
  dueDate: string | null
  subtaskCount: number
}

const COLUMNS: TaskStatus[] = ["open", "doing", "done"]

export function TaskBoard({ tasks }: { tasks: BoardTask[] }) {
  const t = useTranslations("learn.tasks")
  const router = useRouter()
  const [columns, setColumns] = React.useState<Record<TaskStatus, BoardTask[]>>(() =>
    groupTasks(tasks)
  )
  const [active, setActive] = React.useState<BoardTask | null>(null)
  const [prevTasks, setPrevTasks] = React.useState(tasks)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Sync with server data during render (React "derived state" pattern)
  if (prevTasks !== tasks) {
    setPrevTasks(tasks)
    setColumns(groupTasks(tasks))
  }

  const columnLabels: Record<TaskStatus, string> = {
    open: t("columnOpen"),
    doing: t("columnDoing"),
    done: t("columnDone"),
  }

  function findColumn(id: string): TaskStatus | undefined {
    if (COLUMNS.includes(id as TaskStatus)) return id as TaskStatus
    return COLUMNS.find((c) => columns[c].some((task) => task.id === id))
  }

  function onDragStart(event: DragStartEvent) {
    const col = findColumn(String(event.active.id))
    setActive(col ? (columns[col].find((task) => task.id === event.active.id) ?? null) : null)
  }

  function onDragOver(event: DragOverEvent) {
    const { active: a, over } = event
    if (!over) return
    const from = findColumn(String(a.id))
    const to = findColumn(String(over.id))
    if (!from || !to || from === to) return
    setColumns((cols) => {
      const task = cols[from].find((x) => x.id === a.id)
      if (!task) return cols
      const overIndex = cols[to].findIndex((x) => x.id === over.id)
      const insertAt = overIndex >= 0 ? overIndex : cols[to].length
      return {
        ...cols,
        [from]: cols[from].filter((x) => x.id !== a.id),
        [to]: [
          ...cols[to].slice(0, insertAt),
          { ...task, status: to },
          ...cols[to].slice(insertAt),
        ],
      }
    })
  }

  async function onDragEnd(event: DragEndEvent) {
    setActive(null)
    const { active: a, over } = event
    if (!over) return
    const col = findColumn(String(a.id))
    if (!col) return

    // Reorder within the target column (closure state is fresh: onDragOver re-rendered)
    const items = [...columns[col]]
    const oldIndex = items.findIndex((x) => x.id === a.id)
    const newIndex = items.findIndex((x) => x.id === over.id)
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      const [moved] = items.splice(oldIndex, 1)
      items.splice(newIndex, 0, moved)
      setColumns((cols) => ({ ...cols, [col]: items }))
    }

    try {
      await updateTaskStatus(String(a.id), col)
      await reorderTasks(items.map((x) => x.id))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      router.refresh()
    }
  }

  return (
    <DndContext
      id="task-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <BoardColumn key={col} id={col} label={columnLabels[col]} tasks={columns[col]} />
        ))}
      </div>
      <DragOverlay>{active && <TaskCard task={active} overlay />}</DragOverlay>
    </DndContext>
  )
}

function groupTasks(tasks: BoardTask[]): Record<TaskStatus, BoardTask[]> {
  return {
    open: tasks.filter((task) => task.status === "open"),
    doing: tasks.filter((task) => task.status === "doing"),
    done: tasks.filter((task) => task.status === "done"),
  }
}

function BoardColumn({
  id,
  label,
  tasks,
}: {
  id: TaskStatus
  label: string
  tasks: BoardTask[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-muted/40 flex min-h-40 flex-col gap-2 rounded-lg border p-2.5 transition-colors",
        isOver && "border-primary/50"
      )}
    >
      <p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        {label} · {tasks.length}
      </p>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableTaskCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </div>
  )
}

function TaskCard({ task, overlay }: { task: BoardTask; overlay?: boolean }) {
  const t = useTranslations("learn.tasks")
  const priorityVariant = { low: "outline", medium: "secondary", high: "destructive" } as const
  const priorityLabel = {
    low: t("priorityLow"),
    medium: t("priorityMedium"),
    high: t("priorityHigh"),
  } as const

  return (
    <div
      className={cn(
        "bg-card space-y-1.5 rounded-md border p-2.5 text-sm shadow-sm",
        overlay && "shadow-md",
        task.status === "done" && "opacity-60"
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="text-muted-foreground mt-0.5 size-3.5 shrink-0 cursor-grab" />
        <span className={cn("min-w-0 flex-1 font-medium", task.status === "done" && "line-through")}>
          {task.title}
        </span>
        {!overlay && <DeleteButton action={deleteTask.bind(null, task.id)} />}
      </div>
      {task.notes && (
        <p className="text-muted-foreground line-clamp-2 pl-5 text-xs">{task.notes}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <Badge variant={priorityVariant[task.priority]}>{priorityLabel[task.priority]}</Badge>
        {task.dueDate && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CalendarDays className="size-3" />
            {task.dueDate}
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span className="text-muted-foreground text-xs">
            {t("subtasks", { count: task.subtaskCount })}
          </span>
        )}
      </div>
    </div>
  )
}
