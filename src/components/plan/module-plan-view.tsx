"use client"

import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  CalendarClock,
  Clock,
  GripVertical,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActionErrorToast } from "@/components/action-error-toast"
import { Link, useRouter } from "@/i18n/navigation"
import {
  createPlanTask,
  deletePlanTask,
  generateModuleTasks,
  reorderPlanTasks,
  togglePlanTask,
  updatePlanTask,
} from "@/app/[locale]/(app)/plan/plan-task-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { FormDialog } from "@/components/form-dialog"
import { ModulePlanPrefs, type ModulePlanPrefsValue } from "@/components/plan/module-plan-prefs"
import { SetupChecklist, type SetupStep } from "@/components/plan/setup-checklist"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type PlanTaskData = {
  id: string
  title: string
  description: string | null
  estimatedMinutes: number
  dueDate: string | null
  goalId: string | null
  done: boolean
  scheduled: boolean
  aiGenerated: boolean
}

export type UpcomingSession = {
  id: string
  date: string
  startTime: string
  durationMinutes: number
  done: boolean
  taskCount: number
}

export type GoalOption = { id: string; type: string; title: string | null }

export function ModulePlanView({
  moduleId,
  semesterId,
  basePath,
  prefs,
  hasGoals,
  hasExamGoal,
  hasOutline,
  goals,
  tasks,
  sessions,
  setupSteps = [],
}: {
  moduleId: string
  semesterId: string
  basePath: string
  prefs: ModulePlanPrefsValue
  hasGoals: boolean
  hasExamGoal: boolean
  hasOutline: boolean
  goals: GoalOption[]
  tasks: PlanTaskData[]
  sessions: UpcomingSession[]
  setupSteps?: SetupStep[]
}) {
  const t = useTranslations("plan")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [generating, setGenerating] = React.useState(false)

  async function onGenerate() {
    setGenerating(true)
    try {
      const res = await generateModuleTasks(moduleId)
      toast.success(t("tasks.generated", { count: res.created }))
      router.refresh()
    } catch (error) {
      showError(error)
    } finally {
      setGenerating(false)
    }
  }

  // A13: an exam module with neither outline topics nor tasks gets nudged to
  // build (or derive) an outline first, so generation has something to work on.
  const showOutlineNudge = tasks.length === 0 && hasExamGoal && !hasOutline

  return (
    <div className="space-y-6">
      {setupSteps.some((s) => !s.done) && (
        <SetupChecklist steps={setupSteps} storageKey={`module-${moduleId}`} />
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("tasks.title")}</CardTitle>
          {hasGoals && (
            <Button variant="outline" size="sm" disabled={generating} onClick={onGenerate}>
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ListChecks className="size-4" />
              )}
              {t("tasks.generate")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 ? (
            showOutlineNudge ? (
              <div className="space-y-2 py-4 text-center">
                <p className="text-muted-foreground text-sm">{t("tasks.outlineNudge")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`${basePath}/materials`} />}
                >
                  {t("tasks.outlineNudgeCta")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground py-4 text-center text-sm">{t("tasks.empty")}</p>
            )
          ) : (
            <TaskList moduleId={moduleId} tasks={tasks} goals={goals} />
          )}
          <AddTaskForm moduleId={moduleId} goals={goals} />
        </CardContent>
      </Card>

      <ModulePlanPrefs moduleId={moduleId} layout="card" value={prefs} />

      <UpcomingSessions semesterId={semesterId} sessions={sessions} />
    </div>
  )
}

// ---- task list (dnd) ------------------------------------------------------------

function TaskList({
  moduleId,
  tasks,
  goals,
}: {
  moduleId: string
  tasks: PlanTaskData[]
  goals: GoalOption[]
}) {
  const showError = useActionErrorToast()
  const [list, setList] = React.useState(tasks)
  const [prev, setPrev] = React.useState(tasks)
  // Without the keyboard sensor the focusable drag handle below (which announces
  // itself as "reorder") does nothing when activated by keyboard.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Sync with server data during render (React "derived state" pattern).
  if (prev !== tasks) {
    setPrev(tasks)
    setList(tasks)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = list.findIndex((i) => i.id === active.id)
    const newIndex = list.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(list, oldIndex, newIndex)
    setList(next)
    try {
      await reorderPlanTasks(
        moduleId,
        next.map((i) => i.id)
      )
    } catch (error) {
      showError(error)
      setList(tasks)
    }
  }

  return (
    <DndContext
      id={`plan-tasks-${moduleId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {list.map((task) => (
            <SortableTask key={task.id} task={task} goals={goals} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableTask({ task, goals }: { task: PlanTaskData; goals: GoalOption[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-50")}
    >
      <TaskRow task={task} goals={goals} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  )
}

function TaskRow({
  task,
  goals,
  dragHandle,
}: {
  task: PlanTaskData
  goals: GoalOption[]
  dragHandle: Record<string, unknown>
}) {
  const t = useTranslations("plan")
  const showError = useActionErrorToast()
  const format = useFormatter()
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  async function onToggle() {
    try {
      await togglePlanTask(task.id, !task.done)
      router.refresh()
    } catch (error) {
      showError(error)
    }
  }

  return (
    <>
      <div className="group bg-card rounded-md border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground -ml-1 cursor-grab touch-none"
            aria-label={t("tasks.reorder")}
            {...dragHandle}
          >
            <GripVertical className="size-4" />
          </button>
          <Checkbox checked={task.done} onCheckedChange={() => void onToggle()} />
          <span className={cn("font-medium", task.done && "text-muted-foreground line-through")}>
            {task.title}
          </span>
          {task.aiGenerated && <AiBadge iconOnly />}
          {task.scheduled && (
            <Badge variant="outline" className="gap-1">
              <CalendarClock className="size-3" />
              {t("tasks.scheduled")}
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
            {task.dueDate && (
              <span>
                {t("tasks.due")}{" "}
                {format.dateTime(new Date(task.dueDate), { day: "numeric", month: "short" })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {task.estimatedMinutes} min
            </span>
            <button
              type="button"
              className="hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={t("tasks.edit")}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className="hover:text-destructive rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={t("tasks.delete")}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        </div>
        {task.description && (
          <p className="text-muted-foreground mt-1 pl-6.5 text-xs whitespace-pre-wrap">
            {task.description}
          </p>
        )}
      </div>
      <EditTaskDialog task={task} goals={goals} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={task.title}
        onConfirm={async () => {
          await deletePlanTask(task.id)
          router.refresh()
        }}
      />
    </>
  )
}

// ---- task dialogs / forms -------------------------------------------------------

function GoalSelect({
  name,
  defaultValue,
  goals,
}: {
  name: string
  defaultValue?: string | null
  goals: GoalOption[]
}) {
  const t = useTranslations("plan")
  const tGoals = useTranslations("goals.types")
  if (goals.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-sel`}>{t("tasks.goal")}</Label>
      <select
        id={`${name}-sel`}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      >
        <option value="">{t("tasks.noGoal")}</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title || tGoals(g.type)}
          </option>
        ))}
      </select>
    </div>
  )
}

function EditTaskDialog({
  task,
  goals,
  open,
  onOpenChange,
}: {
  task: PlanTaskData
  goals: GoalOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("plan")
  const router = useRouter()
  return (
    <FormDialog
      title={t("tasks.edit")}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={async (form) => {
        await updatePlanTask(task.id, {
          title: String(form.get("title")),
          description: String(form.get("description") || "") || null,
          estimatedMinutes: Number(form.get("estimatedMinutes")) || 60,
          dueDate: String(form.get("dueDate") || "") || null,
          goalId: String(form.get("goalId") || "") || null,
        })
        router.refresh()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="et-title">{t("tasks.titleField")}</Label>
        <Input id="et-title" name="title" defaultValue={task.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="et-desc">{t("tasks.description")}</Label>
        <Textarea id="et-desc" name="description" rows={2} defaultValue={task.description ?? ""} />
      </div>
      <div className="flex gap-3">
        <div className="w-32 space-y-1.5">
          <Label htmlFor="et-mins">{t("tasks.estimatedMinutes")}</Label>
          <Input
            id="et-mins"
            name="estimatedMinutes"
            type="number"
            min={5}
            step={5}
            defaultValue={task.estimatedMinutes}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="et-due">{t("tasks.dueDate")}</Label>
          <Input id="et-due" name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
        </div>
      </div>
      <GoalSelect name="goalId" defaultValue={task.goalId} goals={goals} />
    </FormDialog>
  )
}

function AddTaskForm({ moduleId, goals }: { moduleId: string; goals: GoalOption[] }) {
  const t = useTranslations("plan")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const el = e.currentTarget
    const form = new FormData(el)
    const title = String(form.get("title") || "").trim()
    if (!title) return
    setPending(true)
    try {
      await createPlanTask(moduleId, {
        title,
        estimatedMinutes: Number(form.get("estimatedMinutes")) || 60,
        dueDate: String(form.get("dueDate") || "") || null,
        goalId: String(form.get("goalId") || "") || null,
      })
      el.reset()
      router.refresh()
    } catch (error) {
      showError(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="min-w-40 flex-1 space-y-1">
        <Label htmlFor="at-title" className="text-xs">
          {t("tasks.titleField")}
        </Label>
        <Input id="at-title" name="title" required />
      </div>
      <div className="w-24 space-y-1">
        <Label htmlFor="at-mins" className="text-xs">
          {t("tasks.estimatedMinutes")}
        </Label>
        <Input id="at-mins" name="estimatedMinutes" type="number" min={5} step={5} placeholder="60" />
      </div>
      <div className="w-36 space-y-1">
        <Label htmlFor="at-due" className="text-xs">
          {t("tasks.dueDate")}
        </Label>
        <Input id="at-due" name="dueDate" type="date" />
      </div>
      {goals.length > 0 && (
        <div className="w-40 space-y-1">
          <GoalSelect name="goalId" goals={goals} />
        </div>
      )}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("tasks.add")}
      </Button>
    </form>
  )
}

// ---- upcoming sessions (read-only) ----------------------------------------------

function UpcomingSessions({
  semesterId,
  sessions,
}: {
  semesterId: string
  sessions: UpcomingSession[]
}) {
  const t = useTranslations("plan")
  const format = useFormatter()

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("sessions.title")}</CardTitle>
        <Link
          href={`/plan/${semesterId}`}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {t("sessions.linkToSemester")} →
        </Link>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-sm">{t("sessions.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  s.done && "opacity-60"
                )}
              >
                <CalendarClock className="text-muted-foreground size-4" />
                <span className="font-medium">
                  {format.dateTime(new Date(`${s.date}T${s.startTime}`), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {" · "}
                  {s.startTime}
                </span>
                <span className="text-muted-foreground text-xs">
                  {s.durationMinutes} min · {t("sessions.taskCount", { count: s.taskCount })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
