"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { recomputeSchedule } from "@/app/[locale]/(app)/plan/schedule-actions"
import type { ScheduleWarning } from "@/lib/plan/scheduler"

/**
 * Shared "recompute the plan" action for the strategy board and the plan
 * banners. Runs {@link recomputeSchedule}, shows the A11 summary toast
 * ("Plan aktualisiert: N Sitzungen, M Warnungen") and refreshes. Returns the
 * warnings so a caller can render them inline.
 */
export function useRecompute(semesterId: string) {
  const t = useTranslations("plan")
  const router = useRouter()
  const [computing, setComputing] = React.useState(false)

  const recompute = React.useCallback(async (): Promise<ScheduleWarning[]> => {
    setComputing(true)
    try {
      const res = await recomputeSchedule(semesterId)
      const warnings = res.warnings ?? []
      const sessions = res.sessions ?? 0
      toast.success(t("recompute.summary", { sessions, warnings: warnings.length }))
      router.refresh()
      return warnings
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return []
    } finally {
      setComputing(false)
    }
  }, [semesterId, t, router])

  return { recompute, computing }
}
