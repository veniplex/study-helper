import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation, aiMessage } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getLanguageModel } from "@/lib/ai/registry"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"

export const maxDuration = 300

function buildSystemPrompt(moduleName?: string | null): string {
  return [
    "You are StudyHelper, an AI study assistant for university students.",
    "Answer in the language the user writes in.",
    "Use Markdown. Use LaTeX math ($...$ inline, $$...$$ display) where helpful.",
    moduleName ? `The current conversation is about the module "${moduleName}".` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  try {
    await assertWithinLimit(session.user.id)
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Limit reached", {
      status: 429,
    })
  }

  const body = (await request.json()) as {
    messages: UIMessage[]
    conversationId: string
    model: string
  }

  const conversation = await db.query.aiConversation.findFirst({
    where: and(
      eq(aiConversation.id, body.conversationId),
      eq(aiConversation.userId, session.user.id)
    ),
    with: { module: true },
  })
  if (!conversation) return new Response("Not found", { status: 404 })

  let model
  try {
    model = await getLanguageModel(body.model, session.user.id)
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid model", {
      status: 400,
    })
  }

  // Persist the latest user message
  const lastMessage = body.messages.at(-1)
  if (lastMessage?.role === "user") {
    await db.insert(aiMessage).values({
      conversationId: conversation.id,
      role: "user",
      parts: lastMessage.parts,
    })
  }

  // Derive a title from the first user message
  if (conversation.title === "New conversation" && lastMessage?.role === "user") {
    const text = lastMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .slice(0, 80)
    if (text) {
      await db
        .update(aiConversation)
        .set({ title: text, model: body.model })
        .where(eq(aiConversation.id, conversation.id))
    }
  } else {
    await db
      .update(aiConversation)
      .set({ model: body.model, updatedAt: new Date() })
      .where(eq(aiConversation.id, conversation.id))
  }

  const result = streamText({
    model,
    system: buildSystemPrompt(conversation.module?.name),
    messages: await convertToModelMessages(body.messages),
    onFinish: async ({ usage }) => {
      await logUsage(session.user.id, body.model, "chat", {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })
    },
  })

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      await db.insert(aiMessage).values({
        conversationId: conversation.id,
        role: "assistant",
        parts: responseMessage.parts,
      })
    },
  })
}
