import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"
import type { UIMessage } from "ai"
import { db } from "@/db"
import { aiConversation, aiMessage } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { Link } from "@/i18n/navigation"
import { Chat } from "@/components/ai/chat"
import { MinimizeChatButton } from "@/components/ai/minimize-chat-button"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const session = await requireSession()
  const tCommon = await getTranslations("common")

  const conversation = await db.query.aiConversation.findFirst({
    where: and(
      eq(aiConversation.id, conversationId),
      eq(aiConversation.userId, session.user.id)
    ),
    with: {
      module: true,
      messages: { orderBy: [asc(aiMessage.createdAt)] },
    },
  })
  if (!conversation) notFound()

  const { models, defaultModel } = await listAvailableModels()

  const initialMessages: UIMessage[] = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts as UIMessage["parts"],
  }))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
          <span className="sr-only">{tCommon("back")}</span>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.title}</h1>
        {conversation.module && <Badge variant="secondary">{conversation.module.name}</Badge>}
        <MinimizeChatButton conversationId={conversation.id} />
      </div>
      <Chat
        conversationId={conversation.id}
        initialMessages={initialMessages}
        models={models}
        initialModel={conversation.model ?? defaultModel}
      />
    </div>
  )
}
