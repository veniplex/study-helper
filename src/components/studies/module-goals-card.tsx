"use client"

import * as React from "react"
import {
  BookMarked,
  FileText,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Mic,
  Plus,
  Presentation,
  Target,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { GoalType, GradingSystem } from "@/db/schema/studies"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GoalDialog } from "@/components/studies/goal-dialog"
import {
  GoalCard,
  type BonusProgressDTO,
  type GoalCardData,
} from "@/components/learn/goal-card"

const GOAL_ICON: Record<GoalType, React.ComponentType<{ className?: string }>> = {
  exam: GraduationCap,
  assignments: ListChecks,
  term_paper: FileText,
  presentation: Presentation,
  oral_exam: Mic,
  project: FolderKanban,
  thesis: BookMarked,
  other: Target,
}

/** Types offered as quick-setup chips (empty state + add menu). */
const CHIP_TYPES: GoalType[] = [
  "exam",
  "assignments",
  "term_paper",
  "presentation",
  "oral_exam",
  "project",
  "thesis",
]

type DialogState = { mode: "closed" } | { mode: "create"; type: GoalType }

export function ModuleGoalsCard({
  moduleId,
  basePath,
  cards,
  gradingSystem,
  stats,
  bonus,
}: {
  moduleId: string
  basePath: string
  cards: GoalCardData[]
  gradingSystem: GradingSystem
  stats: { dueCards: number; lastQuizScore: number | null }
  bonus: BonusProgressDTO | null
}) {
  const t = useTranslations("goals")
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })

  function onOpenChange(open: boolean) {
    if (!open) setDialog({ mode: "closed" })
  }

  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {CHIP_TYPES.map((gt) => {
        const Icon = GOAL_ICON[gt]
        return (
          <button
            key={gt}
            type="button"
            onClick={() => setDialog({ mode: "create", type: gt })}
            className="hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
          >
            <Icon className="size-3.5" />
            {t(`types.${gt}`)}
          </button>
        )
      })}
    </div>
  )

  const dialogEl = dialog.mode !== "closed" && (
    <GoalDialog
      key={`new-${dialog.type}`}
      moduleId={moduleId}
      defaultType={dialog.type}
      open
      onOpenChange={onOpenChange}
    />
  )

  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-0.5">
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-muted-foreground text-sm">{t("emptyPrompt")}</p>
          </div>
          {chips}
        </CardContent>
        {dialogEl}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("cardTitle")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialog({ mode: "create", type: "exam" })}
        >
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>
      {cards.map((data) => (
        <GoalCard
          key={data.goal.id}
          moduleId={moduleId}
          basePath={basePath}
          data={data}
          gradingSystem={gradingSystem}
          stats={stats}
          bonus={bonus}
        />
      ))}
      {dialogEl}
    </div>
  )
}
