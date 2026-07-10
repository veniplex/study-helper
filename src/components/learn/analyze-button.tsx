"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { analyzeProgress } from "@/app/[locale]/(app)/learn-actions"
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
  variant = "outline",
}: {
  moduleId: string
  variant?: "outline" | "default"
}) {
  const t = useTranslations("learnSession")
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [analysis, setAnalysis] = React.useState<string | null>(null)

  async function run() {
    setOpen(true)
    if (analysis) return
    setPending(true)
    try {
      const result = await analyzeProgress(moduleId)
      setAnalysis(result.analysis)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setOpen(false)
    } finally {
      setPending(false)
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
            <Markdown>{analysis}</Markdown>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
