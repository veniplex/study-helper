"use client"

import * as React from "react"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { generationStatus } from "@/app/[locale]/(app)/generation-actions"

type Status = Awaited<ReturnType<typeof generationStatus>>

/**
 * Polls a coverage-generation job and renders live progress: a bar over topics
 * covered plus the number of items produced. Calls onDone once when the job
 * reaches a terminal state (so callers can refresh the list).
 */
export function GenerationProgress({ jobId, onDone }: { jobId: string; onDone?: () => void }) {
  const t = useTranslations("learn.generation")
  const [status, setStatus] = React.useState<Status>(null)
  const onDoneRef = React.useRef(onDone)
  React.useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  React.useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const s = await generationStatus(jobId)
        if (!active) return
        setStatus(s)
        if (s && (s.status === "completed" || s.status === "failed" || s.status === "canceled")) {
          onDoneRef.current?.()
          return
        }
      } catch {
        // transient error — keep polling
      }
      if (active) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  const total = status?.topicsTotal ?? 0
  const done = status?.topicsDone ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const failed = status?.status === "failed"
  const completed = status?.status === "completed"

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle className="size-4 text-destructive" />
        ) : completed ? (
          <CheckCircle2 className="size-4 text-green-600" />
        ) : (
          <Loader2 className="size-4 animate-spin" />
        )}
        <span>
          {!status
            ? t("pending")
            : failed
              ? t("failed", { error: status.error ?? "" })
              : completed
                ? t("completed", { count: status.producedCount, total: status.topicsTotal })
                : t("running")}
        </span>
      </div>
      {!failed && (
        <>
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {t("coverage", { done, total })} · {t("produced", { count: status?.producedCount ?? 0 })}
          </div>
        </>
      )}
    </div>
  )
}
