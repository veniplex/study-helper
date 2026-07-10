"use client"

import * as React from "react"
import { BookOpen, Clock, RotateCcw, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deletePlanItem, togglePlanItem } from "@/app/[locale]/(app)/plan/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type PlanItemData = {
  id: string
  kind: "study" | "review" | "assignment"
  title: string
  date: string
  startTime: string | null
  durationMinutes: number
  done: boolean
  moduleName: string | null
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = (d.getDay() + 6) % 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() - day + 3)
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getDay() + 6) % 7)) /
        7
    )
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`
}

const kindVariant = { study: "secondary", review: "outline", assignment: "default" } as const

export function PlanItems({ items }: { items: PlanItemData[] }) {
  const t = useTranslations("semesterPlan")
  const format = useFormatter()
  const router = useRouter()

  const weeks = new Map<string, PlanItemData[]>()
  for (const item of items) {
    const key = isoWeekKey(item.date)
    weeks.set(key, [...(weeks.get(key) ?? []), item])
  }

  async function onToggle(item: PlanItemData, done: boolean) {
    try {
      await togglePlanItem(item.id, done)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function onDelete(item: PlanItemData) {
    try {
      await deletePlanItem(item.id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
  }

  return (
    <div className="space-y-4">
      {[...weeks.entries()].map(([week, weekItems]) => (
        <div key={week} className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("week", { week: week.split("-W")[1] })}
          </h3>
          <ul className="space-y-1.5">
            {weekItems.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  item.done && "opacity-60"
                )}
              >
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(on) => void onToggle(item, Boolean(on))}
                />
                <Badge variant={kindVariant[item.kind]}>
                  {item.kind === "review" && <RotateCcw className="size-3" />}
                  {t(`kind.${item.kind}`)}
                </Badge>
                <span className={cn("font-medium", item.done && "line-through")}>
                  {item.title}
                </span>
                {item.moduleName && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <BookOpen className="size-3" />
                    {item.moduleName}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                  <Clock className="size-3" />
                  {format.dateTime(new Date(item.date), { weekday: "short", day: "numeric", month: "short" })}
                  {item.startTime && ` · ${item.startTime}`}
                  {` · ${item.durationMinutes} min`}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(item)}>
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{t("deleteItem")}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
