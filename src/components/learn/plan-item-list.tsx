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
import { toast } from "sonner"
import { reorderPlanItems } from "@/app/[locale]/(app)/learn-actions"
import { PlanItemRow } from "@/components/learn/plan-item-row"
import { cn } from "@/lib/utils"

export type PlanItem = {
  id: string
  title: string
  description: string | null
  scheduledDate: string | null
  durationMinutes: number | null
  done: boolean
}

export function PlanItemList({ planId, items }: { planId: string; items: PlanItem[] }) {
  const [list, setList] = React.useState(items)
  const [prevItems, setPrevItems] = React.useState(items)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Sync with server data during render (React "derived state" pattern)
  if (prevItems !== items) {
    setPrevItems(items)
    setList(items)
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
      await reorderPlanItems(planId, next.map((i) => i.id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setList(items)
    }
  }

  return (
    <DndContext
      id={`plan-items-${planId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {list.map((item) => (
            <SortableItem key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ item }: { item: PlanItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-50")}
      {...attributes}
      {...listeners}
    >
      <PlanItemRow item={item} />
    </div>
  )
}
