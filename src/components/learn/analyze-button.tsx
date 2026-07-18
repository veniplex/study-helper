"use client"

import * as React from "react"
import { BrainCircuit, Layers, Loader2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { analyzeProgress } from "@/app/[locale]/(app)/learn-actions"
import { createDeck, generateCards } from "@/app/[locale]/(app)/deck-actions"
import { generateQuiz } from "@/app/[locale]/(app)/quiz-actions"
import { Markdown } from "@/components/ai/markdown"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** "What should I deepen?" — AI analysis over the module's full session history. */
export function AnalyzeButton({
  moduleId,
  basePath,
  variant = "outline",
}: {
  moduleId: string
  /** Module base path (/studies/[programId]/[moduleId]) for the one-click
   *  weak-topics generation links; omitting hides those buttons. */
  basePath?: string
  variant?: "outline" | "default"
}) {
  const t = useTranslations("learnSession")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [analysis, setAnalysis] = React.useState<string | null>(null)
  const [weakTopics, setWeakTopics] = React.useState("")
  const [generating, setGenerating] = React.useState<"quiz" | "deck" | null>(null)

  async function run() {
    setOpen(true)
    if (analysis) return
    setPending(true)
    try {
      const result = await analyzeProgress(moduleId)
      setAnalysis(result.analysis)
      setWeakTopics(result.weakTopics ?? "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  async function makeQuiz() {
    setGenerating("quiz")
    try {
      const result = await generateQuiz({ moduleId, count: 10, topics: weakTopics, mixed: true })
      router.push(`${basePath}/quizzes/${result.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setGenerating(null)
    }
  }

  async function makeDeck() {
    setGenerating("deck")
    try {
      const created = await createDeck({ name: t("weakTopicsDeckName"), moduleId })
      await generateCards({ deckId: created.id, count: 15, topics: weakTopics })
      router.push(`${basePath}/decks/${created.id}`)
      return
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setGenerating(null)
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => void run()}>
        <Sparkles className="size-4" />
        {t("analyze")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("analyzeTitle")}</DialogTitle>
          </DialogHeader>
          {pending ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {t("analyzing")}
            </p>
          ) : analysis ? (
            <div className="space-y-4">
              <Markdown>{analysis}</Markdown>
              {basePath && weakTopics && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={generating !== null}
                    onClick={() => void makeQuiz()}
                  >
                    {generating === "quiz" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="size-3.5" />
                    )}
                    {t("weakTopicsQuiz")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={generating !== null}
                    onClick={() => void makeDeck()}
                  >
                    {generating === "deck" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Layers className="size-3.5" />
                    )}
                    {t("weakTopicsDeck")}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
