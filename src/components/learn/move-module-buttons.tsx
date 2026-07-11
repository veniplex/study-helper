"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { reorderModules } from "@/app/[locale]/(app)/studies/actions"

/** Up/down reorder controls for a module row (dashboard Semesterübersicht). */
export function MoveModuleButtons({
  semesterId,
  orderedIds,
  index,
}: {
  semesterId: string
  orderedIds: string[]
  index: number
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function move(delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= orderedIds.length) return
    const ids = [...orderedIds]
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setPending(true)
    try {
      await reorderModules(semesterId, ids)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="flex flex-col">
      <button
        type="button"
        disabled={pending || index === 0}
        onClick={() => void move(-1)}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="up"
      >
        <ChevronUp className="size-3" />
      </button>
      <button
        type="button"
        disabled={pending || index === orderedIds.length - 1}
        onClick={() => void move(1)}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        aria-label="down"
      >
        <ChevronDown className="size-3" />
      </button>
    </span>
  )
}
