"use client"

import * as React from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { toast } from "sonner"
import { reorderModules } from "@/app/[locale]/(app)/studies/actions"
import { cn } from "@/lib/utils"

export type ModuleRow = { id: string; cells: React.ReactNode }

export function SortableModuleTable({
  semesterId,
  head,
  rows,
}: {
  semesterId: string
  head: React.ReactNode
  rows: ModuleRow[]
}) {
  const [order, setOrder] = React.useState(rows.map((r) => r.id))
  const [prevRows, setPrevRows] = React.useState(rows)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Sync with server data during render (React "derived state" pattern)
  if (prevRows !== rows) {
    setPrevRows(rows)
    setOrder(rows.map((r) => r.id))
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const sorted = order.map((id) => byId.get(id)).filter(Boolean) as ModuleRow[]

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(order, oldIndex, newIndex)
    setOrder(next)
    try {
      await reorderModules(semesterId, next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setOrder(rows.map((r) => r.id))
    }
  }

  return (
    <DndContext
      id={`modules-${semesterId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <table className="w-full text-sm">
          <thead>{head}</thead>
          <tbody>
            {sorted.map((row) => (
              <SortableRow key={row.id} id={row.id}>
                {row.cells}
              </SortableRow>
            ))}
          </tbody>
        </table>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("border-b last:border-0", isDragging && "bg-muted/50 opacity-70")}
    >
      <td className="w-8 py-2.5 pr-1 align-middle">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      {children}
    </tr>
  )
}
