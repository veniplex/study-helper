"use client"

import * as React from "react"
import { HelpCircle, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { deleteQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { AiBadge } from "@/components/ai/ai-badge"
import { EditQuizDialog } from "@/components/learn/quiz-dialogs"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu, type ContextMenuAction } from "@/components/entity-context-menu"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type QuizCardData = {
  id: string
  title: string
  description: string | null
  aiGenerated: boolean
  questionCount: number
  finishedCount: number
  bestScore: number
}

export function QuizCard({
  quiz,
  basePath,
  glyph,
  colorSoft,
  colorText,
}: {
  quiz: QuizCardData
  basePath: string
  glyph: React.ReactNode
  colorSoft: string
  colorText: string
}) {
  const t = useTranslations("learn.quizzes")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const actions: ContextMenuAction[] = [
    { label: tCommon("edit"), icon: Pencil, onSelect: () => setEditOpen(true) },
    {
      label: tCommon("delete"),
      icon: Trash2,
      destructive: true,
      onSelect: () => setDeleteOpen(true),
      separatorBefore: true,
    },
  ]

  return (
    <>
      <EntityContextMenu items={actions} label={quiz.title}>
        <div className="group bg-card flex flex-col rounded-xl border p-4">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                colorSoft,
                colorText
              )}
            >
              {glyph}
            </span>
            <Link
              href={`${basePath}/quizzes/${quiz.id}`}
              className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline"
            >
              {quiz.title}
            </Link>
            {quiz.aiGenerated && <AiBadge iconOnly />}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground -mt-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                    aria-label={quiz.title}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  {tCommon("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {quiz.description && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{quiz.description}</p>
          )}
          <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
            <HelpCircle className="size-3.5" />
            {t("questions", { count: quiz.questionCount })}
            {quiz.finishedCount > 0 && (
              <span className="ml-auto tabular-nums">
                {t("bestScore", { score: quiz.bestScore })}
              </span>
            )}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              className="w-full"
              disabled={quiz.questionCount === 0}
              nativeButton={false}
              render={<Link href={`${basePath}/quizzes/${quiz.id}?run=1`} />}
            >
              <Play className="size-4" />
              {t("start")}
            </Button>
          </div>
        </div>
      </EntityContextMenu>
      <EditQuizDialog
        quizId={quiz.id}
        initialTitle={quiz.title}
        initialDescription={quiz.description}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={quiz.title}
        onConfirm={async () => {
          await deleteQuiz(quiz.id)
          router.refresh()
        }}
      />
    </>
  )
}
