"use client"

import { AlertTriangle, CalendarClock, Loader2, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useRecompute } from "@/components/plan/use-recompute"

/**
 * Plan banners shown above the semester plan:
 * - staleness (A2): the plan is out of date after a mutation
 * - catch-up (A10): N past sessions were missed (not done, still have open tasks)
 * Both offer a one-click recompute with the A11 summary toast.
 */
export function PlanBanners({
  semesterId,
  stale,
  missedCount,
}: {
  semesterId: string
  stale: boolean
  missedCount: number
}) {
  const t = useTranslations("plan")
  const { recompute, computing } = useRecompute(semesterId)

  if (!stale && missedCount <= 0) return null

  return (
    <div className="space-y-2">
      {missedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <CalendarClock className="size-4 shrink-0 text-amber-600" />
          <span>{t("catchUp.message", { count: missedCount })}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={computing}
            onClick={() => void recompute()}
          >
            {computing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("catchUp.action")}
          </Button>
        </div>
      )}
      {stale && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <span>{t("staleness.message")}</span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={computing}
            onClick={() => void recompute()}
          >
            {computing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("staleness.action")}
          </Button>
        </div>
      )}
    </div>
  )
}
