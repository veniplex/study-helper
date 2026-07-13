"use client"

import * as React from "react"
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react"
import { useTranslations, useFormatter } from "next-intl"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { checkForUpdatesNow } from "@/app/[locale]/(app)/admin/actions"

type LatestCheck = {
  latestVersion: string
  htmlUrl: string
  publishedAt: string
  checkedAt: string
} | null

export function UpdateStatus({
  currentVersion,
  latest,
  updateAvailable,
}: {
  currentVersion: string
  latest: LatestCheck
  updateAvailable: boolean
}) {
  const t = useTranslations("admin.updates")
  const format = useFormatter()
  const [pending, setPending] = React.useState(false)

  async function checkNow() {
    setPending(true)
    try {
      const result = await checkForUpdatesNow()
      if (!result.ok) throw new Error(result.error)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          {updateAvailable && (
            <Badge>
              <Sparkles /> {t("updateAvailable")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("currentVersion")}: </span>
          <span className="font-mono">{currentVersion}</span>
        </div>

        {updateAvailable && latest && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{t("newVersion", { version: latest.latestVersion })}</p>
            <p className="text-muted-foreground mt-1">
              {t("publishedOn", { date: format.dateTime(new Date(latest.publishedAt), "medium") })}
            </p>
            <a
              href={latest.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary mt-2 inline-flex items-center gap-1 hover:underline"
            >
              {t("viewOnGithub")} <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}

        {!updateAvailable && latest && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="size-4" /> {t("upToDate")}
          </p>
        )}

        {!latest && <p className="text-muted-foreground text-sm">{t("neverChecked")}</p>}

        {latest && (
          <p className="text-muted-foreground text-xs">
            {t("lastChecked", { date: format.dateTime(new Date(latest.checkedAt), "medium") })}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={checkNow} disabled={pending} variant="outline">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("checkNow")}
        </Button>
      </CardFooter>
    </Card>
  )
}
