"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { MessageCircle, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePathname } from "@/i18n/navigation"
import { CHAT_OPEN_EVENT, LAST_CHAT_KEY } from "@/components/ai/chat-events"
import type { ModuleOption } from "@/components/learn/module-select"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// The conversation panel drags in the AI SDK, react-markdown and katex. Load it
// on demand (client-only) so none of that lands in the shared layout bundle —
// it is fetched the first time the dock actually opens (F1).
const ConversationPanel = dynamic(
  () => import("@/components/ai/conversation-panel").then((m) => m.ConversationPanel),
  { ssr: false }
)

export { CHAT_OPEN_EVENT }

/** Floating chat launcher + dock panel (conversation UI lives in ConversationPanel). */
export function ChatDock({
  models,
  initialModel,
  modules,
}: {
  models: { ref: string; label: string }[]
  initialModel: string | null
  modules: ModuleOption[]
}) {
  const t = useTranslations("ai")
  const pathname = usePathname()
  const isFullscreenChat = pathname.startsWith("/ai/")
  const [open, setOpen] = React.useState(false)
  const [targetId, setTargetId] = React.useState<string | null>(null)

  // Bottom-nav "AI" tab and the fullscreen page's minimize button open the dock
  React.useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ conversationId?: string }>).detail?.conversationId
      setTargetId(id ?? null)
      setOpen(true)
    }
    window.addEventListener(CHAT_OPEN_EVENT, handler)
    return () => window.removeEventListener(CHAT_OPEN_EVENT, handler)
  }, [])

  // Leaving the fullscreen chat (navigation elsewhere) shrinks it back into
  // the dock so the conversation is not lost.
  const prevPathRef = React.useRef(pathname)
  React.useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = pathname
    if (prev.startsWith("/ai/") && !pathname.startsWith("/ai/")) {
      setTargetId(window.localStorage.getItem(LAST_CHAT_KEY))
      setOpen(true)
    }
  }, [pathname])

  if (models.length === 0) return null
  const model = initialModel ?? models[0]?.ref ?? null

  return (
    <div className="print:hidden">
      {open && !isFullscreenChat && (
        <div
          className={cn(
            "bg-background fixed z-50 flex flex-col border shadow-xl",
            // mobile: fullscreen; desktop: floating panel
            "inset-0 lg:inset-auto lg:right-5 lg:bottom-20 lg:h-[620px] lg:max-h-[calc(100dvh-8rem)] lg:w-[420px] lg:rounded-xl"
          )}
        >
          <ConversationPanel
            variant="dock"
            model={model}
            modules={modules}
            targetConversationId={targetId}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
      <div
        className={cn(
          "fixed right-5 bottom-5 z-50 hidden lg:block",
          isFullscreenChat && "lg:hidden"
        )}
      >
        <Button
          size="icon"
          className="size-12 rounded-full shadow-lg"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
          <span className="sr-only">{t("quickChat")}</span>
        </Button>
      </div>
    </div>
  )
}
