"use client"

import * as React from "react"
import {
  BookMarked,
  FileText,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Mic,
  Pencil,
  Plus,
  Presentation,
  Target,
  Trash2,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deleteGoal } from "@/app/[locale]/(app)/studies/goal-actions"
import type { GoalGradingRole, GoalType } from "@/db/schema/studies"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GoalDialog, type GoalData } from "@/components/studies/goal-dialog"

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

const ROLE_BADGE_VARIANT: Record<GoalGradingRole, "default" | "secondary" | "outline"> = {
  grade: "default",
  bonus: "secondary",
  practice: "outline",
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

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; type: GoalType }
  | { mode: "edit"; goal: GoalData }

export function ModuleGoalsCard({
  moduleId,
  goals,
}: {
  moduleId: string
  goals: GoalData[]
}) {
  const t = useTranslations("goals")
  const format = useFormatter()
  const router = useRouter()
  const [dialog, setDialog] = React.useState<DialogState>({ mode: "closed" })
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  function onOpenChange(open: boolean) {
    if (!open) setDialog({ mode: "closed" })
  }

  async function onDelete(goal: GoalData) {
    if (!goal.id) return
    if (!confirm(t("deleteConfirm"))) return
    setPendingId(goal.id)
    try {
      await deleteGoal(goal.id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingId(null)
    }
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("cardTitle")}</CardTitle>
        {goals.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ mode: "create", type: "exam" })}
          >
            <Plus className="size-4" />
            {t("add")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {goals.length === 0 ? (
          <div className="space-y-3">
            <div className="space-y-0.5">
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="text-muted-foreground text-sm">{t("emptyPrompt")}</p>
            </div>
            {chips}
          </div>
        ) : (
          <ul className="space-y-2">
            {goals.map((goal) => {
              const Icon = GOAL_ICON[goal.type]
              return (
                <li
                  key={goal.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-sm"
                >
                  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {goal.title || t(`types.${goal.type}`)}
                    </span>
                    {goal.dueDate && (
                      <span className="text-muted-foreground text-xs">
                        {format.dateTime(new Date(goal.dueDate), { dateStyle: "medium" })}
                      </span>
                    )}
                  </span>
                  <Badge variant={ROLE_BADGE_VARIANT[goal.gradingRole]}>
                    {t(`roles.${goal.gradingRole}`)}
                  </Badge>
                  <span className="inline-flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDialog({ mode: "edit", goal })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pendingId === goal.id}
                      onClick={() => void onDelete(goal)}
                    >
                      <Trash2 className="text-destructive size-3.5" />
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {dialog.mode !== "closed" && (
        <GoalDialog
          key={dialog.mode === "edit" ? dialog.goal.id : `new-${dialog.type}`}
          moduleId={moduleId}
          goal={dialog.mode === "edit" ? dialog.goal : undefined}
          defaultType={dialog.mode === "create" ? dialog.type : undefined}
          open
          onOpenChange={onOpenChange}
        />
      )}
    </Card>
  )
}
