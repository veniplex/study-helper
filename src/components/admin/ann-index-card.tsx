"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAnnStatus, startVectorReindex } from "@/app/[locale]/(app)/admin/actions"

type AnnStatus = {
  status: "idle" | "building" | "ready" | "failed"
  embeddingModel?: string
  dimensions?: number
  error?: string
}

/**
 * Admin control for the optional pgvector HNSW ANN index: shows its state and
 * triggers a background rebuild. While building it polls for status.
 */
export function AnnIndexCard({
  initial,
  embeddingConfigured,
}: {
  initial: AnnStatus
  embeddingConfigured: boolean
}) {
  const t = useTranslations("admin.ai")
  const [status, setStatus] = React.useState<AnnStatus>(initial)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    if (status.status !== "building") return
    let active = true
    const timer = setInterval(async () => {
      try {
        const s = (await getAnnStatus()) as AnnStatus
        if (active) setStatus(s)
      } catch {
        // transient — keep polling
      }
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [status.status])

  async function onRebuild() {
    setPending(true)
    try {
      await startVectorReindex()
      setStatus((s) => ({ ...s, status: "building" }))
      toast.success(t("annRebuilding"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const label: Record<AnnStatus["status"], string> = {
    idle: t("annStatusIdle"),
    building: t("annStatusBuilding"),
    ready: t("annStatusReady"),
    failed: t("annStatusFailed"),
  }
  const busy = pending || status.status === "building"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("annTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t("annDescription")}</p>
        <div className="text-sm">
          <span className="font-medium">{label[status.status]}</span>
          {status.status === "ready" && status.dimensions
            ? ` · ${status.embeddingModel} · dim ${status.dimensions}`
            : ""}
          {status.status === "failed" && status.error ? ` — ${status.error}` : ""}
        </div>
        <Button onClick={onRebuild} disabled={busy || !embeddingConfigured}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("annRebuild")}
        </Button>
        {!embeddingConfigured && (
          <p className="text-muted-foreground text-xs">{t("annNeedEmbedding")}</p>
        )}
      </CardContent>
    </Card>
  )
}
