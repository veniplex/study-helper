"use client"

import * as React from "react"
import { Copy, Loader2, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { regenerateIcsToken } from "@/app/[locale]/(app)/calendar/actions"

export function IcsCard({ appUrl, token }: { appUrl: string; token: string | null }) {
  const t = useTranslations("calendar.ics")
  const [pending, setPending] = React.useState(false)
  const [currentToken, setCurrentToken] = React.useState(token)
  const url = currentToken ? `${appUrl}/api/ics/${currentToken}` : null

  async function regenerate() {
    setPending(true)
    try {
      const result = await regenerateIcsToken()
      setCurrentToken(result.token)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {url && (
          <>
            <Input readOnly value={url} className="max-w-md flex-1 font-mono text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(url)
                toast.success(t("copied"))
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={regenerate} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {currentToken ? t("regenerate") : t("generate")}
        </Button>
      </CardContent>
    </Card>
  )
}
