"use client"

import { Minimize2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { CHAT_OPEN_EVENT } from "@/components/ai/chat-dock"
import { Button } from "@/components/ui/button"

/** Fullscreen conversation → back to the floating chat dock. */
export function MinimizeChatButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai")
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={t("minimize")}
      onClick={() => {
        router.push("/")
        window.dispatchEvent(
          new CustomEvent(CHAT_OPEN_EVENT, { detail: { conversationId } })
        )
      }}
    >
      <Minimize2 className="size-4" />
      <span className="sr-only">{t("minimize")}</span>
    </Button>
  )
}
