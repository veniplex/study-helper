"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { deleteGoal, updateGoalProgress } from "@/app/[locale]/(app)/learn/actions"
import { DeleteButton } from "@/components/studies/delete-button"

export function GoalCard({
  goal,
}: {
  goal: {
    id: string
    title: string
    description: string | null
    progress: number
    targetDate: string | null
    moduleName?: string | null
  }
}) {
  const t = useTranslations("learn.goals")
  const router = useRouter()
  const [progress, setProgress] = React.useState(goal.progress)

  async function commit(value: number) {
    try {
      await updateGoalProgress(goal.id, value)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{goal.title}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {goal.moduleName && <Badge variant="secondary">{goal.moduleName}</Badge>}
            {goal.targetDate && (
              <span className="text-muted-foreground text-xs">
                {t("targetDate")}: {goal.targetDate}
              </span>
            )}
          </div>
        </div>
        <DeleteButton action={deleteGoal.bind(null, goal.id)} />
      </CardHeader>
      <CardContent className="space-y-2">
        {goal.description && (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{goal.description}</p>
        )}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            onMouseUp={() => commit(progress)}
            onTouchEnd={() => commit(progress)}
            className="accent-primary flex-1"
          />
          <span className="w-12 text-right text-sm font-semibold tabular-nums">{progress}%</span>
        </div>
      </CardContent>
    </Card>
  )
}
