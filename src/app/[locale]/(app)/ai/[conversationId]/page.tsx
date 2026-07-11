import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import type { UIMessage } from "ai"
import { db } from "@/db"
import { aiConversation, aiMessage } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { Chat } from "@/components/ai/chat"
import { MinimizeChatButton } from "@/components/ai/minimize-chat-button"
import { Badge } from "@/components/ui/badge"

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const session = await requireSession()

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
