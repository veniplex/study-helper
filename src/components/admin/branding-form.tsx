"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveBranding, saveUploads } from "@/app/[locale]/(admin)/admin/actions"

export function BrandingForm({
  initial,
  uploads,
}: {
  initial: { appName: string }
  uploads: { maxUploadMb: number }
}) {
  const t = useTranslations("admin.branding")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)
  const [appName, setAppName] = React.useState(initial.appName)
  const [maxUploadMb, setMaxUploadMb] = React.useState(uploads.maxUploadMb)

  async function save() {
    setPending(true)
    try {
      await saveBranding({ appName })
      await saveUploads({ maxUploadMb })
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="appName">{t("appName")}</Label>
            <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxUpload">{t("maxUploadMb")}</Label>
            <Input
              id="maxUpload"
              type="number"
              min={1}
              value={maxUploadMb}
              onChange={(e) => setMaxUploadMb(Number(e.target.value))}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={save} disabled={pending || !appName.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {tCommon("save")}
        </Button>
      </CardFooter>
    </Card>
  )
}
