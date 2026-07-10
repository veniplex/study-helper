"use client"

import * as React from "react"
import { Loader2, MessageCircle, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { UIMessage } from "ai"
import {
  createConversation,
  getConversationMessages,
} from "@/app/[locale]/(app)/ai/actions"
import { Chat } from "@/components/ai/chat"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "studyhelper.quickChatId"

export function FloatingChat({
  models,
  initialModel,
}: {
  models: { ref: string; label: string }[]
  initialModel: string | null
}) {
  const t = useTranslations("ai")
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [conversationId, setConversationId] = React.useState<string | null>(null)
  const [initialMessages, setInitialMessages] = React.useState<UIMessage[]>([])

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    if (conversationId) {
      setOpen(true)
      return
    }
    setPending(true)
    try {
      // Reuse the quick-chat conversation across sessions
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const messages = await getConversationMessages(stored)
        if (messages) {
          setInitialMessages(messages as UIMessage[])
          setConversationId(stored)
          setOpen(true)
          return
        }
        window.localStorage.removeItem(STORAGE_KEY)
      }
      const { id } = await createConversation(null, "general")
      window.localStorage.setItem(STORAGE_KEY, id)
      setConversationId(id)
      setOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  if (models.length === 0) return null

  return (
    <div className="fixed right-5 bottom-5 z-50 hidden lg:block print:hidden">
      {open && conversationId && (
        <div className="bg-background mb-3 flex h-[600px] max-h-[calc(100dvh-8rem)] w-100 flex-col rounded-xl border p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{t("quickChat")}</p>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="size-4" />
              <span className="sr-only">{t("close")}</span>
            </Button>
          </div>
          <Chat
            conversationId={conversationId}
            initialMessages={initialMessages}
            models={models}
            initialModel={initialModel}
            className="h-auto min-h-0 flex-1"
          />
        </div>
      )}
      <div className="flex justify-end">
        <Button size="icon" className="size-12 rounded-full shadow-lg" onClick={toggle}>
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : open ? (
            <X className="size-5" />
          ) : (
            <MessageCircle className="size-5" />
          )}
          <span className="sr-only">{t("quickChat")}</span>
        </Button>
      </div>
    </div>
  )
}
