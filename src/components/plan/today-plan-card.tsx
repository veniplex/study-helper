"use client"

import { CalendarClock } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { Link, useRouter } from "@/i18n/navigation"
import { toggleSession } from "@/app/[locale]/(app)/plan/schedule-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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

  if (items.length === 0) return null

  async function onToggle(id: string, done: boolean) {
    try {
      await toggleSession(id, done)
      router.refresh()
    } catch (error) {
      showError(error)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          {t("today")}
        </CardTitle>
        <Link
          href={`/plan/${items[0].semesterId}`}
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
                  onCheckedChange={(on) => void onToggle(item.id, Boolean(on))}
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
