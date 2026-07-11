"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateWeeklyGoal } from "@/app/[locale]/(app)/settings/actions"

export function LearningSettings({ initialGoalMinutes }: { initialGoalMinutes: number | null }) {
  const t = useTranslations("settings.learning")
  const tCommon = useTranslations("common")
  const [hours, setHours] = React.useState(
    initialGoalMinutes ? String(Math.round((initialGoalMinutes / 60) * 10) / 10) : ""
  )
  const [pending, setPending] = React.useState(false)

  async function onSave() {
    setPending(true)
    try {
      const parsed = Number(hours.replace(",", "."))
      await updateWeeklyGoal(hours.trim() === "" ? null : Math.round(parsed * 60))
      toast.success(tCommon("save"))
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
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="weekly-goal">{t("weeklyGoal")}</Label>
          <Input
            id="weekly-goal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
            placeholder={t("placeholder")}
            className="w-32"
          />
        </div>
        <Button onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {tCommon("save")}
        </Button>
      </CardContent>
    </Card>
  )
}
