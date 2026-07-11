import { AlarmClock, ArrowRight, Layers, ListTodo } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"

export type NextExam = {
  title: string
  startsAt: Date
  moduleName: string | null
  /** Full days until the exam, computed by the caller. */
  daysUntil: number
  /** 0–100 preparedness heuristic for the exam's module; null = no data. */
  preparedness: number | null
}

/**
 * "What should I do right now?" — the dashboard's single call to action:
 * due cards, today's open plan sessions and the next exam countdown.
 */
export async function TodayFocusCard({
  dueCards,
  openPlanItems,
  nextExam,
}: {
  dueCards: number
  openPlanItems: number
  nextExam: NextExam | null
}) {
  const t = await getTranslations("dashboard.focus")
  const format = await getFormatter()

  const daysToExam = nextExam?.daysUntil ?? null

  const nothingToDo = dueCards === 0 && openPlanItems === 0 && !nextExam
  if (nothingToDo) return null

  return (
    <Card className="border-primary/30">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-2">
          {dueCards > 0 && (
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-violet-500" />
              <span className="text-sm">{t("dueCards", { count: dueCards })}</span>
            </div>
          )}
          {openPlanItems > 0 && (
            <div className="flex items-center gap-2">
              <ListTodo className="size-4 text-emerald-500" />
              <span className="text-sm">{t("planItems", { count: openPlanItems })}</span>
            </div>
          )}
          {nextExam && daysToExam != null && (
            <div className="flex items-center gap-2">
              <AlarmClock className="size-4 text-red-500" />
              <span className="text-sm">
                {t("examIn", { title: nextExam.title, days: daysToExam })}
                <span className="text-muted-foreground">
                  {" · "}
                  {format.dateTime(nextExam.startsAt, { dateStyle: "medium" })}
                  {nextExam.preparedness != null &&
                    ` · ${t("prepared", { percent: nextExam.preparedness })}`}
                </span>
              </span>
            </div>
          )}
        </div>
        {dueCards > 0 && (
          <Button nativeButton={false} render={<Link href="/study/due" />}>
            {t("start")}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
