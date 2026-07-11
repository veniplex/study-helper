"use client"

import * as React from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowRight, GripVertical } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  deleteModule,
  deleteSemester,
  reorderModulesAcrossSemesters,
} from "@/app/[locale]/(app)/studies/actions"
import type { SemesterModule } from "@/lib/studies/context"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { ModuleStatusBadge } from "@/components/learn/module-status-badge"
import { DeleteButton } from "@/components/studies/delete-button"
import { Link } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

function ModuleGlyph({ iconKey, className }: { iconKey: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
}

export type BoardSemester = {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  dateRangeLabel: string | null
  isCurrent: boolean
  modules: SemesterModule[]
}

export type BoardLabels = {
  examType: string
  ects: string
  grade: string
  prep: string
  noModules: string
  toPlan: string
  currentSemester: string
}

const CONTAINER_PREFIX = "sem:"

function initColumns(semesters: BoardSemester[]): Record<string, string[]> {
  return Object.fromEntries(semesters.map((s) => [s.id, s.modules.map((m) => m.id)]))
}

export function SemesterModulesBoard({
  programId,
  semesters,
  gradeLabel,
  preparedness,
  labels,
}: {
  programId: string
  semesters: BoardSemester[]
  /** Precomputed final-grade label per module id (formatted string). */
  gradeLabel: Map<string, string>
  preparedness: Map<string, number | null>
  labels: BoardLabels
}) {
  const router = useRouter()
  const [columns, setColumns] = React.useState<Record<string, string[]>>(() =>
    initColumns(semesters)
  )
  const [prevSemesters, setPrevSemesters] = React.useState(semesters)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Sync with server data after a revalidate (React "derived state" pattern).
  if (prevSemesters !== semesters) {
    setPrevSemesters(semesters)
    setColumns(initColumns(semesters))
  }

  const modulesById = new Map(semesters.flatMap((s) => s.modules).map((m) => [m.id, m]))

  function findContainer(id: string): string | null {
    if (id.startsWith(CONTAINER_PREFIX)) return id.slice(CONTAINER_PREFIX.length)
    for (const [semId, ids] of Object.entries(columns)) if (ids.includes(id)) return semId
    return null
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId)
    if (!activeContainer || !overContainer || activeContainer === overContainer) return
    setColumns((cols) => {
      const activeItems = cols[activeContainer]
      const overItems = cols[overContainer]
      const overIndex = overItems.indexOf(overId)
      const newIndex = overIndex >= 0 ? overIndex : overItems.length
      return {
        ...cols,
        [activeContainer]: activeItems.filter((id) => id !== activeId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeId,
          ...overItems.slice(newIndex),
        ],
      }
    })
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId)
    if (!activeContainer || !overContainer) return

    let finalColumns = columns
    if (activeContainer === overContainer) {
      const items = columns[activeContainer]
      const oldIndex = items.indexOf(activeId)
      const newIndex = items.indexOf(overId)
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        finalColumns = { ...columns, [activeContainer]: arrayMove(items, oldIndex, newIndex) }
        setColumns(finalColumns)
      }
    }

    try {
      await reorderModulesAcrossSemesters(
        Object.entries(finalColumns).map(([semesterId, ids]) => ({ semesterId, ids }))
      )
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setColumns(initColumns(semesters))
    }
  }

  return (
    <DndContext
      id="semester-modules-board"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {semesters.map((sem) => (
        <div key={sem.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 border-b pb-1.5">
            <span className="font-medium">{sem.name}</span>
            {sem.isCurrent && (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                {labels.currentSemester}
              </span>
            )}
            {sem.dateRangeLabel && (
              <span className="text-muted-foreground text-xs">{sem.dateRangeLabel}</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <Link
                href={`/plan/${sem.id}`}
                className="text-muted-foreground hover:text-foreground mr-1 flex items-center gap-1 text-xs"
              >
                {labels.toPlan}
                <ArrowRight className="size-3" />
              </Link>
              <ModuleDialog semesterId={sem.id} />
              <SemesterDialog
                programId={programId}
                semester={{
                  id: sem.id,
                  name: sem.name,
                  startDate: sem.startDate,
                  endDate: sem.endDate,
                }}
              />
              <DeleteButton action={deleteSemester.bind(null, sem.id)} />
            </span>
          </div>

          <SemesterDropZone
            semesterId={sem.id}
            ids={columns[sem.id] ?? []}
            modulesById={modulesById}
            gradeLabel={gradeLabel}
            preparedness={preparedness}
            programId={programId}
            labels={labels}
          />
        </div>
      ))}
    </DndContext>
  )
}

function SemesterDropZone({
  semesterId,
  ids,
  modulesById,
  gradeLabel,
  preparedness,
  programId,
  labels,
}: {
  semesterId: string
  ids: string[]
  modulesById: Map<string, SemesterModule>
  gradeLabel: Map<string, string>
  preparedness: Map<string, number | null>
  programId: string
  labels: BoardLabels
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${CONTAINER_PREFIX}${semesterId}` })

  return (
    <div ref={setNodeRef} className={cn("rounded-md", isOver && "bg-accent/40")}>
      {ids.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">{labels.noModules}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[42rem] space-y-1">
            <div className="text-muted-foreground flex items-center gap-3 pb-1 text-xs font-medium">
              <span className="w-5 shrink-0" />
              <span className="min-w-0 flex-1" />
              <span className="w-24 shrink-0" />
              <span className="w-24 shrink-0">{labels.examType}</span>
              <span className="w-10 shrink-0 text-right">{labels.ects}</span>
              <span className="w-10 shrink-0 text-right">{labels.grade}</span>
              <span className="w-28 shrink-0">{labels.prep}</span>
              <span className="w-16 shrink-0" />
            </div>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {ids.map((id) => {
                const mod = modulesById.get(id)
                if (!mod) return null
                return (
                  <ModuleRow
                    key={id}
                    module={mod}
                    semesterId={semesterId}
                    programId={programId}
                    gradeLabel={gradeLabel.get(id) ?? "–"}
                    prep={mod.status === "active" ? (preparedness.get(id) ?? null) : null}
                  />
                )
              })}
            </SortableContext>
          </div>
        </div>
      )}
    </div>
  )
}

function ModuleRow({
  module: m,
  semesterId,
  programId,
  gradeLabel,
  prep,
}: {
  module: SemesterModule
  semesterId: string
  programId: string
  gradeLabel: string
  prep: number | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
  })
  const color = getModuleColorClasses(m.color)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-md py-1 text-sm",
        isDragging && "bg-muted/50 opacity-70"
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground w-5 shrink-0 cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Link
        href={`/studies/${programId}/${m.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 font-medium underline-offset-4 hover:underline"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded",
            color.soft,
            color.text
          )}
        >
          <ModuleGlyph iconKey={m.icon} className="size-3.5" />
        </span>
        <span className="truncate">{m.name}</span>
      </Link>
      <span className="w-24 shrink-0">
        <ModuleStatusBadge status={m.status} />
      </span>
      <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">
        {m.examType ?? "–"}
      </span>
      <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
        {m.ects ?? "–"}
      </span>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums">{gradeLabel}</span>
      {m.status === "active" ? (
        <span className="flex w-28 shrink-0 items-center gap-2">
          <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            {prep != null && (
              <span className="bg-primary block h-full rounded-full" style={{ width: `${prep}%` }} />
            )}
          </span>
          <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
            {prep != null ? `${prep}%` : "–"}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground w-28 shrink-0 text-xs">–</span>
      )}
      <span className="flex w-16 shrink-0 items-center justify-end gap-0.5">
        <ModuleDialog semesterId={semesterId} module={m} />
        <DeleteButton action={deleteModule.bind(null, m.id)} />
      </span>
    </div>
  )
}
