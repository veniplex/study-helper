"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { createConversation } from "@/app/[locale]/(app)/ai/actions"

export function NewChatButton({ moduleId }: { moduleId?: string }) {
  const t = useTranslations("ai")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onClick() {
    setPending(true)
    try {
      const { id } = await createConversation(moduleId ?? null)
      router.push(`/ai/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {t("newChat")}
    </Button>
  )
}
