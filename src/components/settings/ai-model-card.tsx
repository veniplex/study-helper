"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { updatePreferredModel } from "@/app/[locale]/(app)/settings/actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const GLOBAL_DEFAULT = "__default__"

/** Lets a user pick their preferred AI model, or fall back to the admin default. */
export function AiModelCard({
  models,
  current,
  defaultLabel,
}: {
  models: { ref: string; label: string }[]
  /** The user's stored preferred model ref, or null for the global default. */
  current: string | null
  /** Label of the admin-configured global default model. */
  defaultLabel: string | null
}) {
  const t = useTranslations("settings.aiModel")
  const [value, setValue] = React.useState(current ?? GLOBAL_DEFAULT)
  const [pending, setPending] = React.useState(false)

  async function onChange(next: string) {
    setValue(next)
    setPending(true)
    try {
      await updatePreferredModel(next === GLOBAL_DEFAULT ? "" : next)
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const selectedLabel =
    value === GLOBAL_DEFAULT
      ? `${t("globalDefault")}${defaultLabel ? ` · ${defaultLabel}` : ""}`
      : (models.find((m) => m.ref === value)?.label ?? value)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Select value={value} onValueChange={(v) => v && onChange(v)} disabled={pending}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue>{selectedLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL_DEFAULT}>
                {t("globalDefault")}
                {defaultLabel ? ` · ${defaultLabel}` : ""}
              </SelectItem>
              {models.map((m) => (
                <SelectItem key={m.ref} value={m.ref}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
        </div>
      </CardContent>
    </Card>
  )
}
