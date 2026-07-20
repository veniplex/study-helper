"use client"

import * as React from "react"
import { CalendarClock } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { Link, useRouter } from "@/i18n/navigation"
import { toggleSession } from "@/app/[locale]/(app)/plan/schedule-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { enqueue, isNetworkError } from "@/lib/offline/outbox"
import { cn } from "@/lib/utils"

export type TodayPlanSession = {
  id: string
  startTime: string
  durationMinutes: number
  done: boolean
  moduleName: string | null
  semesterId: string
  tasks: { id: string; title: string; done: boolean }[]
}

/** Dashboard card: today's plan sessions, each checkable, with task titles. */
export function TodayPlanCard({ items }: { items: TodayPlanSession[] }) {
  const t = useTranslations("semesterPlan")
  const showError = useActionErrorToast()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (items.length === 0) return null

  function onToggle(id: string, done: boolean) {
    // Disable during flight so rapid taps can't double-fire (D13).
    startTransition(async () => {
      try {
        await toggleSession(id, done)
        router.refresh()
      } catch (error) {
        // Offline: queue it like card reviews do, instead of failing with a
        // toast. The outbox already had a "toggle-session" handler wired up —
        // nothing ever enqueued for it, so ticking off a session was the one
        // study action that didn't work on the train.
        if (isNetworkError(error)) {
          await enqueue("toggle-session", { sessionId: id, done })
          router.refresh()
          return
        }
        showError(error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          {t("today")}
        </CardTitle>
        {/* the empty-list early return above guarantees a first item */}
        <Link
          href={`/plan/${items[0]!.semesterId}`}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {t("title")} →
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                item.done && "opacity-60"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={item.done}
                  disabled={pending}
                  onCheckedChange={(on) => onToggle(item.id, Boolean(on))}
                  aria-label={t("toggleSession", {
                    // moduleName is null for module-independent sessions.
                    label: [item.moduleName, item.startTime].filter(Boolean).join(" · "),
                  })}
                />
                <span className={cn("font-medium", item.done && "line-through")}>
                  {item.moduleName ?? ""}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {item.startTime} · {item.durationMinutes} min
                </span>
              </div>
              {item.tasks.length > 0 && (
                <ul className="text-muted-foreground mt-1 space-y-0.5 pl-6 text-xs">
                  {item.tasks.map((task) => (
                    <li key={task.id} className={cn(task.done && "line-through")}>
                      {task.title}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
