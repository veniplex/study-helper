"use client"

import { CalendarClock } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import { togglePlanItem } from "@/app/[locale]/(app)/plan/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type TodayPlanItem = {
  id: string
  title: string
  startTime: string | null
  durationMinutes: number
  done: boolean
  moduleName: string | null
  semesterId: string
}

/** Dashboard card: today's semester-plan sessions, checkable. */
export function TodayPlanCard({ items }: { items: TodayPlanItem[] }) {
  const t = useTranslations("semesterPlan")
  const router = useRouter()

  if (items.length === 0) return null

  async function onToggle(id: string, done: boolean) {
    try {
      await togglePlanItem(id, done)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
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
                "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
                item.done && "opacity-60"
              )}
            >
              <Checkbox
                checked={item.done}
                onCheckedChange={(on) => void onToggle(item.id, Boolean(on))}
              />
              <span className={cn("font-medium", item.done && "line-through")}>
                {item.title}
              </span>
              {item.moduleName && (
                <span className="text-muted-foreground text-xs">{item.moduleName}</span>
              )}
              <span className="text-muted-foreground ml-auto text-xs">
                {item.startTime && `${item.startTime} · `}
                {item.durationMinutes} min
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
