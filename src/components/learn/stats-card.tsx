import { Clock, Flame } from "lucide-react"
import { getTranslations } from "next-intl/server"
import type { DashboardStats } from "@/lib/learning/stats-server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function level(count: number): string {
  if (count === 0) return "bg-muted"
  if (count < 3) return "bg-primary/30"
  if (count < 8) return "bg-primary/60"
  return "bg-primary"
}

export async function StatsCard({ stats }: { stats: DashboardStats }) {
  const t = await getTranslations("stats")

  // Columns = weeks (heatmap is oldest→newest, 7 days per week)
  const weeks: (typeof stats.heatmap)[] = []
  for (let i = 0; i < stats.heatmap.length; i += 7) {
    weeks.push(stats.heatmap.slice(i, i + 7))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5" title={t("streak")}>
            <Flame className={cn("size-4", stats.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
            <strong>{stats.streak}</strong>
            <span className="text-muted-foreground">{t("days", { count: stats.streak })}</span>
          </span>
          <span className="flex items-center gap-1.5" title={t("weekTime")}>
            <Clock className="text-muted-foreground size-4" />
            <strong>{Math.floor(stats.weekMinutes / 60)}h {stats.weekMinutes % 60}m</strong>
            <span className="text-muted-foreground">{t("thisWeek")}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex w-max gap-[3px]">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {week.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${t("activities", { count: cell.count })}`}
                    className={cn("size-2.5 rounded-[2px]", level(cell.count))}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
