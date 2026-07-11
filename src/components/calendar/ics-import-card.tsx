"use client"

import * as React from "react"
import { Loader2, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { importIcsFile } from "@/app/[locale]/(app)/calendar/actions"

/** Upload a university .ics export and import its events. */
export function IcsImportCard() {
  const t = useTranslations("calendar.icsImport")
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)

  async function onFile(file: File) {
    setPending(true)
    try {
      const form = new FormData()
      form.set("file", file)
      const result = await importIcsFile(form)
      toast.success(t("done", { imported: result.imported, skipped: result.skipped }))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={inputRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onFile(file)
          }}
        />
        <Button variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {t("button")}
        </Button>
      </CardContent>
    </Card>
  )
}
