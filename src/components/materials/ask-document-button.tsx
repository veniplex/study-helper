"use client"

import * as React from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { createConversation } from "@/app/[locale]/(app)/ai/actions"

/** Starts a document-scoped AI conversation ("chat with this document").
 *  Disabled until extraction has finished — an un-extracted document has no
 *  retrievable text to ground the chat. */
export function AskDocumentButton({
  materialId,
  extractionStatus,
}: {
  materialId: string
  extractionStatus?: string | null
}) {
  const t = useTranslations("materials")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  // Only files that finished extraction have retrievable text. Links (no
  // status) stay enabled.
  const notReady = extractionStatus != null && extractionStatus !== "ready"

  async function start() {
    setPending(true)
    try {
      const { id } = await createConversation(null, "general", materialId)
      router.push(`/ai/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || notReady}
      onClick={() => void start()}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
      {t("askDocument")}
    </Button>
  )

  if (!notReady) return button

  return (
    <TooltipProvider>
      <Tooltip>
        {/* A disabled button swallows pointer events, so wrap it for the tooltip. */}
        <TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger>
        <TooltipContent>{t("askDocumentProcessing")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
