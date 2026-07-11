"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { toggleSubtask } from "@/app/[locale]/(app)/assignment-actions"
import type { AssignmentSubtask } from "@/db/schema/assignments"

/** Interactive checklist under an assignment row. */
export function SubtaskList({
  assignmentId,
  subtasks,
}: {
  assignmentId: string
  subtasks: AssignmentSubtask[]
}) {
  const t = useTranslations("assignments")
  const router = useRouter()
  // Optimistic done-state so ticking feels instant.
  const [local, setLocal] = React.useState<Record<string, boolean>>({})

  const done = subtasks.filter((s) => local[s.id] ?? s.done).length

  async function onToggle(subtaskId: string, value: boolean) {
    setLocal((m) => ({ ...m, [subtaskId]: value }))
    try {
      await toggleSubtask(assignmentId, subtaskId, value)
      router.refresh()
    } catch (error) {
      setLocal((m) => ({ ...m, [subtaskId]: !value }))
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">
        {t("subtasksProgress", { done, total: subtasks.length })}
      </p>
      <ul className="space-y-0.5">
        {subtasks.map((s) => {
          const checked = local[s.id] ?? s.done
          return (
            <li key={s.id}>
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(on) => void onToggle(s.id, on === true)}
                />
                <span className={checked ? "text-muted-foreground line-through" : ""}>
                  {s.title}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
