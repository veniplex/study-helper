"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActionErrorToast } from "@/components/action-error-toast"
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
  const showError = useActionErrorToast()
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
      showError(error)
      return []
    } finally {
      setComputing(false)
    }
  }, [semesterId, t, router, showError])

  return { recompute, computing }
}
