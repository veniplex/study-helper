import * as React from "react"
import { Clock, Flame, Layers, Target, TrendingUp } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import type { DashboardStats } from "@/lib/learning/stats-server"
import { getModuleColorClasses, getModuleIcon } from "@/lib/module-visuals"
import { Link } from "@/i18n/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function ModuleGlyph({ iconKey, className }: { iconKey: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
}

function level(count: number): string {
  if (count === 0) return "bg-muted"
  if (count < 3) return "bg-primary/30"
  if (count < 8) return "bg-primary/60"
  return "bg-primary"
}

function hm(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export async function StatsCard({ stats }: { stats: DashboardStats }) {
  const t = await getTranslations("stats")
  const format = await getFormatter()

  // Columns = weeks (heatmap is oldest→newest, 7 days per week)
  const weeks: (typeof stats.heatmap)[] = []
  for (let i = 0; i < stats.heatmap.length; i += 7) {
    weeks.push(stats.heatmap.slice(i, i + 7))
  }

  const topColor = stats.topModule ? getModuleColorClasses(stats.topModule.color) : null

  const tiles: {
    key: string
    label: string
    value: string
    icon: typeof Flame
    accent: string
    href?: string
  }[] = [
    {
      key: "streak",
      label: t("streakLabel"),
      value: `${stats.streak} ${t("days", { count: stats.streak })}`,
      icon: Flame,
      accent: stats.streak > 0 ? "text-orange-500" : "text-muted-foreground",
    },
    {
      key: "week",
      label: t("weekTimeLabel"),
      value: hm(stats.weekMinutes),
      icon: Clock,
      accent: "text-sky-500",
    },
    {
      key: "month",
      label: t("monthTimeLabel"),
      value: hm(stats.monthMinutes),
      icon: TrendingUp,
      accent: "text-emerald-500",
    },
    {
      key: "due",
      label: t("dueTodayLabel"),
      value: String(stats.dueToday),
      icon: Layers,
      accent: "text-violet-500",
      href: stats.dueToday > 0 ? "/study/due" : undefined,
    },
    {
      key: "quiz",
      label: t("avgQuizLabel"),
      value: stats.avgQuizScore30d != null ? `${stats.avgQuizScore30d}%` : t("none"),
      icon: Target,
      accent: "text-amber-500",
    },
    {
      key: "sessions",
      label: t("sessionsLabel"),
      value: String(stats.weekSessions),
      icon: Clock,
      accent: "text-rose-500",
    },
  ]

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => {
            const inner = (
              <>
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <tile.icon className={cn("size-3.5", tile.accent)} />
                  {tile.label}
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</p>
              </>
            )
            return tile.href ? (
              <Link
                key={tile.key}
                href={tile.href}
                className="hover:border-primary/50 hover:bg-accent/40 rounded-lg border p-2.5 transition-colors"
              >
                {inner}
              </Link>
            ) : (
              <div key={tile.key} className="rounded-lg border p-2.5">
                {inner}
              </div>
            )
          })}
        </div>

        {stats.weeklyGoalMinutes != null && stats.weeklyGoalMinutes > 0 && (
          <div className="space-y-1 rounded-lg border p-2.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{t("weeklyGoalLabel")}</span>
              <span className="tabular-nums">
                {hm(stats.weekMinutes)} / {hm(stats.weeklyGoalMinutes)}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.round((stats.weekMinutes / stats.weeklyGoalMinutes) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        {stats.topModule && topColor && (
          <div className="flex items-center gap-2 rounded-lg border p-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md",
                topColor.soft,
                topColor.text
              )}
            >
              <ModuleGlyph iconKey={stats.topModule.icon} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs">{t("topModuleLabel")}</p>
              <p className="truncate text-sm font-medium">{stats.topModule.name}</p>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {hm(stats.topModule.minutes)}
            </span>
          </div>
        )}

        <div className="space-y-1">
          {/* Month labels: shown at the week where a new month starts */}
          <div className="flex gap-[3px]">
            {weeks.map((week, i) => {
              const month = new Date(week[0].date).getMonth()
              const prevMonth = i > 0 ? new Date(weeks[i - 1][0].date).getMonth() : -1
              return (
                <span
                  key={i}
                  className="text-muted-foreground min-w-0 flex-1 overflow-visible text-[9px] leading-3 whitespace-nowrap"
                >
                  {month !== prevMonth
                    ? format.dateTime(new Date(week[0].date), { month: "short" })
                    : ""}
                </span>
              )
            })}
          </div>
          <div className="flex w-full gap-[3px]">
            {weeks.map((week, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {week.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${t("activities", { count: cell.count })}`}
                    className={cn("aspect-square w-full rounded-[2px]", level(cell.count))}
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
