"use client"

import * as React from "react"
import { Loader2, MessageSquare } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { createConversation } from "@/app/[locale]/(app)/ai/actions"

/** Starts a document-scoped AI conversation ("chat with this document"). */
export function AskDocumentButton({ materialId }: { materialId: string }) {
  const t = useTranslations("materials")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

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

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => void start()}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
      {t("askDocument")}
    </Button>
  )
}
