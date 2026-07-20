"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowRight, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { useRouter } from "@/i18n/navigation"
import {
  deleteModule,
  deleteSemester,
  reorderModulesAcrossSemesters,
} from "@/app/[locale]/(app)/studies/actions"
import type { SemesterModule } from "@/lib/studies/context"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu } from "@/components/entity-context-menu"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { ModuleStatusBadge } from "@/components/learn/module-status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  const showError = useActionErrorToast()
  const [columns, setColumns] = React.useState<Record<string, string[]>>(() =>
    initColumns(semesters)
  )
  const [activeId, setActiveId] = React.useState<string | null>(null)
  // Snapshot taken at drag start — lets us skip the write entirely when a
  // drag ends up back where it started (no DB round-trip for a plain click).
  const dragStartColumns = React.useRef<Record<string, string[]> | null>(null)
  const [prevSemesters, setPrevSemesters] = React.useState(semesters)
  // KeyboardSensor alongside the pointer one: moving a module to another
  // semester exists only as a drag, so without it that action is unreachable
  // without a mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Sync with server data after a revalidate (React "derived state" pattern).
  // Skipped mid-drag/pending-refresh so the just-set optimistic order isn't
  // clobbered by a stale server response racing the mutation.
  if (prevSemesters !== semesters && activeId == null) {
    setPrevSemesters(semesters)
    setColumns(initColumns(semesters))
  }

  const modulesById = new Map(semesters.flatMap((s) => s.modules).map((m) => [m.id, m]))

  function findContainer(id: string): string | null {
    if (id.startsWith(CONTAINER_PREFIX)) return id.slice(CONTAINER_PREFIX.length)
    for (const [semId, ids] of Object.entries(columns)) if (ids.includes(id)) return semId
    return null
  }

  function onDragStart(event: DragStartEvent) {
    dragStartColumns.current = columns
    setActiveId(String(event.active.id))
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
      // findContainer can name a column that is not in state (stale drag target)
      if (!activeItems || !overItems) return cols
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
    const startColumns = dragStartColumns.current
    dragStartColumns.current = null
    setActiveId(null)

    const { active, over } = event
    if (!over || !startColumns) return
    const activeDragId = String(active.id)
    const overId = String(over.id)
    const activeContainer = findContainer(activeDragId)
    const overContainer = findContainer(overId)
    if (!activeContainer || !overContainer) return

    let finalColumns = columns
    if (activeContainer === overContainer) {
      const items = columns[activeContainer]
      const oldIndex = items?.indexOf(activeDragId) ?? -1
      const newIndex = items?.indexOf(overId) ?? -1
      if (items && oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        finalColumns = { ...columns, [activeContainer]: arrayMove(items, oldIndex, newIndex) }
        setColumns(finalColumns)
      }
    }

    // Dropped back exactly where it started (e.g. a plain click) — no need
    // to touch the database or trigger a refresh.
    const unchanged =
      JSON.stringify(finalColumns[activeContainer]) ===
        JSON.stringify(startColumns[activeContainer]) &&
      (activeContainer === overContainer ||
        JSON.stringify(finalColumns[overContainer]) === JSON.stringify(startColumns[overContainer]))
    if (unchanged) return

    try {
      await reorderModulesAcrossSemesters(
        Object.entries(finalColumns).map(([semesterId, ids]) => ({ semesterId, ids }))
      )
      // Keep the optimistic order on screen while the server data streams
      // back in, instead of suspending the board on every drop.
      React.startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      showError(error)
      setColumns(initColumns(semesters))
    }
  }

  function onDragCancel() {
    dragStartColumns.current = null
    setActiveId(null)
    setColumns(initColumns(semesters))
  }

  const activeModule = activeId ? (modulesById.get(activeId) ?? null) : null

  return (
    <DndContext
      id="semester-modules-board"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {semesters.map((sem) => (
        <div key={sem.id} className="overflow-x-auto">
          <div className="min-w-[40rem] space-y-2">
            <SemesterHeaderRow programId={programId} semester={sem} labels={labels} />
            <SemesterDropZone
              semesterId={sem.id}
              ids={columns[sem.id] ?? []}
              modulesById={modulesById}
              gradeLabel={gradeLabel}
              preparedness={preparedness}
              programId={programId}
              labels={labels}
            />
            <div className="flex justify-end">
              <Link
                href={`/plan/${sem.id}`}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                {labels.toPlan}
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      ))}
      <DragOverlay>
        {activeModule && (
          <div className="bg-card flex items-center gap-2 rounded-md border px-2 py-1 shadow-lg">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded",
                getModuleColorClasses(activeModule.color).soft,
                getModuleColorClasses(activeModule.color).text
              )}
            >
              <ModuleGlyph iconKey={activeModule.icon} className="size-3.5" />
            </span>
            <span className="truncate text-sm font-medium">{activeModule.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SemesterHeaderRow({
  programId,
  semester: sem,
  labels,
}: {
  programId: string
  semester: BoardSemester
  labels: BoardLabels
}) {
  const tCommon = useTranslations("common")
  const tStudies = useTranslations("studies")
  const router = useRouter()
  const [addModuleOpen, setAddModuleOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  return (
    <EntityContextMenu
      label={sem.name}
      items={[
        { label: tStudies("newModule"), icon: Plus, onSelect: () => setAddModuleOpen(true) },
        { label: tCommon("edit"), icon: Pencil, onSelect: () => setEditOpen(true), separatorBefore: true },
        { label: tCommon("delete"), icon: Trash2, destructive: true, onSelect: () => setDeleteOpen(true) },
      ]}
    >
    <div className="group flex items-center gap-3 border-b pb-1.5">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-medium">{sem.name}</span>
        <button
          type="button"
          onClick={() => setAddModuleOpen(true)}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
          title={tStudies("newModule")}
        >
          <Plus className="size-3.5" />
          <span className="sr-only">{tStudies("newModule")}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                aria-label={sem.name}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {sem.isCurrent && (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
            {labels.currentSemester}
          </span>
        )}
        {sem.dateRangeLabel && (
          <span className="text-muted-foreground shrink-0 text-xs">{sem.dateRangeLabel}</span>
        )}
      </span>
      {/* Column labels — same fixed widths as the module rows below */}
      <span className="w-20 shrink-0" />
      <span className="text-muted-foreground w-20 shrink-0 truncate text-xs font-medium">
        {labels.examType}
      </span>
      <span className="text-muted-foreground w-9 shrink-0 truncate text-right text-xs font-medium">
        {labels.ects}
      </span>
      <span className="text-muted-foreground w-9 shrink-0 truncate text-right text-xs font-medium">
        {labels.grade}
      </span>
      <span className="text-muted-foreground w-28 shrink-0 truncate text-xs font-medium">
        {labels.prep}
      </span>

      <ModuleDialog semesterId={sem.id} open={addModuleOpen} onOpenChange={setAddModuleOpen} />
      <SemesterDialog
        programId={programId}
        semester={{ id: sem.id, name: sem.name, startDate: sem.startDate, endDate: sem.endDate }}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={sem.name}
        onConfirm={async () => {
          await deleteSemester(sem.id)
          router.refresh()
        }}
      />
    </div>
    </EntityContextMenu>
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
        <div className="space-y-1">
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
  const tCommon = useTranslations("common")
  const tStudiesModule = useTranslations("studies.module")
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
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
      <EntityContextMenu
        label={m.name}
        items={[
          { label: tCommon("edit"), icon: Pencil, onSelect: () => setEditOpen(true) },
          { label: tCommon("delete"), icon: Trash2, destructive: true, onSelect: () => setDeleteOpen(true), separatorBefore: true },
        ]}
      >
      <span className="group/name flex min-w-0 flex-1 items-center gap-1">
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
          {m.isThesis && (
            <span className="bg-violet-500/15 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
              {tStudiesModule("thesisBadge")}
            </span>
          )}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1 opacity-0 transition-opacity group-hover/name:opacity-100 data-popup-open:opacity-100"
                aria-label={m.name}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      </EntityContextMenu>
      <span className="w-20 shrink-0">
        <ModuleStatusBadge status={m.status} />
      </span>
      <span className="text-muted-foreground w-20 shrink-0 truncate text-xs">
        {m.examType ?? "–"}
      </span>
      <span className="text-muted-foreground w-9 shrink-0 truncate text-right text-xs tabular-nums">
        {m.ects ?? "–"}
      </span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums">{gradeLabel}</span>
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

      <ModuleDialog
        semesterId={semesterId}
        module={m}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={m.name}
        onConfirm={async () => {
          await deleteModule(m.id)
          router.refresh()
        }}
      />
    </div>
  )
}
