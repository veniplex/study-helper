"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getReembedStatus, startReembed } from "@/app/[locale]/(app)/admin/actions"

type ReembedState = {
  status: "idle" | "running" | "done" | "failed"
  embeddingModel?: string
  total?: number
  done?: number
  failed?: number
  error?: string
}

/**
 * Admin control for the embedding backfill: warns when materials are still
 * embedded with a different model than the active one (their vector search is
 * dead until re-embedded) and lets the admin (re)start the backfill. Polls
 * while the job runs.
 */
export function ReembedCard({
  initialState,
  initialStaleCount,
  embeddingConfigured,
}: {
  initialState: ReembedState
  initialStaleCount: number
  embeddingConfigured: boolean
}) {
  const t = useTranslations("admin.ai")
  const [state, setState] = React.useState<ReembedState>(initialState)
  const [staleCount, setStaleCount] = React.useState(initialStaleCount)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    if (state.status !== "running") return
    let active = true
    const timer = setInterval(async () => {
      try {
        const s = await getReembedStatus()
        if (active) {
          setState(s.state as ReembedState)
          setStaleCount(s.staleCount)
        }
      } catch {
        // transient — keep polling
      }
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [state.status])

  async function onStart() {
    setPending(true)
    try {
      await startReembed()
      setState((s) => ({ ...s, status: "running" }))
      toast.success(t("reembedStarted"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const busy = pending || state.status === "running"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("reembedTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t("reembedDescription")}</p>
        {staleCount > 0 && state.status !== "running" && (
          <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{t("reembedStaleWarning", { count: staleCount })}</p>
          </div>
        )}
        <div className="text-sm">
          {state.status === "running" ? (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Loader2 className="size-3.5 animate-spin" />
              {t("reembedRunning", { done: state.done ?? 0, total: state.total ?? 0 })}
            </span>
          ) : state.status === "done" ? (
            <span className="font-medium">
              {t("reembedDone", { done: state.done ?? 0, failed: state.failed ?? 0 })}
            </span>
          ) : state.status === "failed" ? (
            <span className="text-destructive font-medium">
              {t("reembedFailed")}
              {state.error ? ` — ${state.error}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("reembedIdle")}</span>
          )}
        </div>
        <Button onClick={onStart} disabled={busy || !embeddingConfigured || staleCount === 0}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("reembedStart")}
        </Button>
        {!embeddingConfigured && (
          <p className="text-muted-foreground text-xs">{t("annNeedEmbedding")}</p>
        )}
      </CardContent>
    </Card>
  )
}
