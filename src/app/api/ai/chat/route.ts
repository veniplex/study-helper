import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation, aiMessage } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getLanguageModel } from "@/lib/ai/registry"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { searchChunks } from "@/lib/ai/rag"
import { MODE_PROMPTS, type ChatMode } from "@/lib/ai/modes"
import { getSetting } from "@/lib/settings"

export const maxDuration = 300

function buildSystemPrompt(
  moduleName: string | null | undefined,
  ragEnabled: boolean,
  mode: ChatMode,
  pageContext?: string
): string {
  return [
    "You are StudyHelper, an AI study assistant for university students.",
    "Answer in the language the user writes in.",
    "Use Markdown. Use LaTeX math ($...$ inline, $$...$$ display) where helpful.",
    moduleName ? `The current conversation is about the module "${moduleName}".` : "",
    MODE_PROMPTS[mode] ?? "",
    ragEnabled
      ? "You can search the user's uploaded study materials with the searchMaterials tool. Use it whenever a question may relate to their course content, and cite the source material names in your answer."
      : "",
    pageContext
      ? `The user is currently looking at this page in the app: ${pageContext}. Use this as context when the question refers to "this module", "this page", or similar.`
      : "",
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
    pageContext?: string
  }
  const pageContext =
    typeof body.pageContext === "string" ? body.pageContext.slice(0, 500) : undefined

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

  const ai = await getSetting("ai")
  const ragEnabled = Boolean(ai?.defaultEmbeddingModel)
  const userId = session.user.id
  const moduleId = conversation.moduleId

  const result = streamText({
    model,
    system: buildSystemPrompt(
      conversation.module?.name,
      ragEnabled,
      (conversation.mode as ChatMode) ?? "general",
      pageContext
    ),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: ragEnabled
      ? {
          searchMaterials: tool({
            description:
              "Search the user's uploaded study materials (lecture notes, slides, PDFs) for relevant passages.",
            inputSchema: z.object({
              query: z.string().describe("Search query in the language of the materials"),
            }),
            execute: async ({ query }) => {
              const hits = await searchChunks(userId, query, { moduleId, limit: 6 })
              return hits.map((h) => ({
                source: h.materialName,
                excerpt: h.content.slice(0, 1500),
              }))
            },
          }),
        }
      : undefined,
    onFinish: async ({ totalUsage }) => {
      await logUsage(userId, body.model, "chat", {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
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
