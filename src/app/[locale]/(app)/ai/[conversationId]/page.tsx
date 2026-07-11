import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"
import type { UIMessage } from "ai"
import { db } from "@/db"
import { aiConversation, aiMessage } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { getStudyContext } from "@/lib/studies/context"
import { ConversationPanel } from "@/components/ai/conversation-panel"

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const session = await requireSession()

  const [conversation, { models, defaultModel }, context] = await Promise.all([
    db.query.aiConversation.findFirst({
      where: and(
        eq(aiConversation.id, conversationId),
        eq(aiConversation.userId, session.user.id)
      ),
      with: {
        module: true,
        messages: { orderBy: [asc(aiMessage.createdAt)] },
      },
    }),
    listAvailableModels(),
    getStudyContext(session.user.id),
  ])
  if (!conversation) notFound()

  const initialMessages: UIMessage[] = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts as UIMessage["parts"],
  }))
  const modules = context.tree.flatMap((s) =>
    s.modules.map((m) => ({ id: m.id, name: m.name }))
  )

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] w-full max-w-3xl flex-col md:h-[calc(100dvh-6.5rem)]">
      <div className="bg-background min-h-0 flex-1 rounded-xl border">
        <ConversationPanel
          variant="page"
          model={conversation.model ?? defaultModel ?? models[0]?.ref ?? null}
          modules={modules}
          initialConversation={{
            id: conversation.id,
            title: conversation.title,
            moduleId: conversation.moduleId,
            moduleName: conversation.module?.name ?? null,
          }}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  )
}
