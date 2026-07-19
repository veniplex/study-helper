"use client"

import * as React from "react"
import { useFormatter, useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { useRouter } from "@/i18n/navigation"
import { togglePlanTask } from "@/app/[locale]/(app)/plan/plan-task-actions"
import { toggleSession } from "@/app/[locale]/(app)/plan/schedule-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type SessionDialogData = {
  id: string
  date: string
  startTime: string
  durationMinutes: number
  done: boolean
  moduleName: string | null
  tasks: { id: string; title: string; done: boolean }[]
}

/** Read/act sheet for a plan session: toggle its tasks and mark it done. */
export function SessionDialog({
  session,
  open,
  onOpenChange,
}: {
  session: SessionDialogData | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("plan.session")
  const format = useFormatter()
  const router = useRouter()
  const showError = useActionErrorToast()
  const [pending, startTransition] = React.useTransition()

  if (!session) return null

  function run(fn: () => Promise<unknown>) {
    // Disable the controls while a toggle is in flight so rapid taps can't
    // double-fire against the server (D13).
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (error) {
        showError(error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{session.moduleName ?? t("title")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {format.dateTime(new Date(`${session.date}T${session.startTime}`), {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {" · "}
          {session.startTime} · {session.durationMinutes} min
        </p>

        <label className="bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Checkbox
            checked={session.done}
            disabled={pending}
            onCheckedChange={(on) => run(() => toggleSession(session.id, Boolean(on)))}
          />
          <span className={cn("font-medium", session.done && "line-through")}>{t("done")}</span>
        </label>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("tasks")}</p>
          {session.tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noTasks")}</p>
          ) : (
            <ul className="space-y-1.5">
              {session.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={task.done}
                    disabled={pending}
                    onCheckedChange={(on) => run(() => togglePlanTask(task.id, Boolean(on)))}
                  />
                  <span className={cn(task.done && "text-muted-foreground line-through")}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
