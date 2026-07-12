import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai"
import { z } from "zod"
import { and, asc, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation, aiMessage, studyEvent } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getLanguageModel, listAvailableModels } from "@/lib/ai/registry"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { searchChunks } from "@/lib/ai/rag"
import { MODE_PROMPTS, type ChatMode } from "@/lib/ai/modes"
import { writeToolDescriptions, writeToolSchemas, WRITE_TOOL_NAMES } from "@/lib/ai/tools"
import { getStudyContext } from "@/lib/studies/context"
import { getModuleDetail } from "@/lib/studies/module-detail"
import { getModuleFinalGrades } from "@/lib/studies/grades-server"
import { getSetting } from "@/lib/settings"

export const maxDuration = 300

const LOCALE_NAMES: Record<string, string> = { de: "German", en: "English" }

function buildSystemPrompt(
  moduleName: string | null | undefined,
  moduleId: string | null | undefined,
  ragEnabled: boolean,
  mode: ChatMode,
  pageContext?: string,
  locale?: string
): string {
  const language = locale ? LOCALE_NAMES[locale] : undefined
  return [
    "You are StudyHelper, an AI study assistant for university students.",
    language
      ? `The user's app language is ${language}. Always answer in ${language}, and write ALL generated content — flashcard fronts/backs, quiz questions, options, reference answers, explanations, deck/quiz titles, event titles — in ${language}, even if the source materials or the user's message are in another language, unless the user explicitly asks for a different language.`
      : "Answer in the language the user writes in.",
    "Use Markdown. Use LaTeX math ($...$ inline, $$...$$ display) where helpful.",
    moduleName
      ? `The current conversation is about the module "${moduleName}"${moduleId ? ` (moduleId: ${moduleId})` : ""}. Use this moduleId for write tools that target this module.`
      : "",
    MODE_PROMPTS[mode] ?? "",
    ragEnabled
      ? "You can search the user's uploaded study materials with the searchMaterials tool. Use it whenever a question may relate to their course content, and cite the source material names in your answer."
      : "",
    pageContext
      ? `The user is currently looking at this page in the app: ${pageContext}. Use this as context when the question refers to "this module", "this page", or similar. If the page context contains a moduleId, use it directly as the moduleId for write tools (decks, quizzes, events, assignments) unless the user names a different module.`
      : "",
    `You are an agent inside the StudyHelper app and can create things for the user with the tools ${WRITE_TOOL_NAMES.join(", ")}. Each write tool shows the user a confirmation card before anything is saved. Use getContext to look up the user's modules, exams and deadlines when you need ids or dates. When creating a deck or quiz for a module, pass that module's id — take it from the page context or conversation module if present, otherwise call getContext to resolve it; never leave moduleId empty when the user clearly means a specific module. When the user's request is ambiguous (e.g. which module or scope), ask a short clarifying question first instead of guessing.`,
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

  const body = (await request.json().catch(() => null)) as {
    messages: UIMessage[]
    conversationId: string
    model: string
    pageContext?: string
    locale?: string
  } | null
  if (
    !body ||
    !Array.isArray(body.messages) ||
    typeof body.conversationId !== "string" ||
    typeof body.model !== "string"
  ) {
    return new Response("Invalid request body", { status: 400 })
  }
  const pageContext =
    typeof body.pageContext === "string" ? body.pageContext.slice(0, 500) : undefined
  const locale = typeof body.locale === "string" ? body.locale.slice(0, 10) : undefined

  // Only allow models the admin actually configured — otherwise arbitrary
  // model ids could be run against the globally configured API keys.
  const { models } = await listAvailableModels()
  if (!models.some((m) => m.ref === body.model)) {
    return new Response("Unknown model", { status: 400 })
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

  const ai = await getSetting("ai")
  const ragEnabled = Boolean(ai?.defaultEmbeddingModel)
  const userId = session.user.id
  const moduleId = conversation.moduleId

  const result = streamText({
    model,
    system: buildSystemPrompt(
      conversation.module?.name,
      conversation.moduleId,
      ragEnabled,
      (conversation.mode as ChatMode) ?? "general",
      pageContext,
      locale
    ),
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(8),
    tools: {
      ...(ragEnabled
        ? {
            searchMaterials: tool({
              description:
                "Search the user's uploaded study materials (lecture notes, slides, PDFs) for relevant passages.",
              inputSchema: z.object({
                query: z.string().describe("Search query in the language of the materials"),
              }),
              execute: async ({ query }) => {
                const hits = await searchChunks(userId, query, { moduleId, limit: 6 })
                if (hits.length > 0) {
                  const { logAudit } = await import("@/lib/audit")
                  await logAudit({
                    userId,
                    actor: "ai",
                    operation: "ai_read",
                    entityType: "material",
                    entityId: query.slice(0, 100),
                    entityLabel: [...new Set(hits.map((h) => h.materialName))].join(", "),
                    conversationId: conversation.id,
                  })
                }
                return hits.map((h) => ({
                  source: h.materialName,
                  excerpt: h.content.slice(0, 1500),
                }))
              },
            }),
          }
        : {}),
      getContext: tool({
        description:
          "Look up the user's study context: semesters (with date ranges) and their modules (id, name, status, final grade), upcoming exams and deadlines. Use before creating things that need a moduleId or dates, or for overview questions. For deep questions about ONE module (grades, assignments, contacts, bonus) call getModuleDetails instead.",
        inputSchema: z.object({}),
        execute: async () => {
          const ctx = await getStudyContext(userId)
          const moduleIds = ctx.tree.flatMap((s) => s.modules.map((m) => m.id))
          const [events, finalGrades] = await Promise.all([
            moduleIds.length
              ? db.query.studyEvent.findMany({
                  where: and(
                    eq(studyEvent.userId, userId),
                    gte(studyEvent.startsAt, new Date()),
                    inArray(studyEvent.moduleId, moduleIds)
                  ),
                  orderBy: [asc(studyEvent.startsAt)],
                  limit: 20,
                  columns: { title: true, type: true, startsAt: true, moduleId: true },
                })
              : [],
            ctx.activeProgram ? getModuleFinalGrades(ctx.activeProgram.id) : Promise.resolve(new Map()),
          ])
          return {
            activeProgram: ctx.activeProgram?.name ?? null,
            currentSemesterId: ctx.currentSemesterId,
            semesters: ctx.tree.map((s) => ({
              id: s.id,
              name: s.name,
              startDate: s.startDate,
              endDate: s.endDate,
              isCurrent: s.id === ctx.currentSemesterId,
              modules: s.modules.map((m) => ({
                id: m.id,
                name: m.name,
                status: m.status,
                finalGrade: finalGrades.get(m.id)?.grade ?? null,
              })),
            })),
            upcomingEvents: events,
          }
        },
      }),
      getModuleDetails: tool({
        description:
          "Get everything about ONE module: status, ECTS, exam type, assessment attempts and computed final grade, assignment bonus progress, contacts, assignments, upcoming events and deck/quiz counts. Pass the module id from getContext.",
        inputSchema: z.object({ moduleId: z.string().describe("Module id from getContext") }),
        execute: async ({ moduleId: id }) => {
          try {
            return await getModuleDetail(userId, id)
          } catch {
            return { error: "Module not found or not accessible." }
          }
        },
      }),
      // Write tools: no execute — the client shows a confirmation card and
      // runs the action only after the user approves.
      createDeckWithCards: tool({
        description: writeToolDescriptions.createDeckWithCards,
        inputSchema: writeToolSchemas.createDeckWithCards,
      }),
      createQuizWithQuestions: tool({
        description: writeToolDescriptions.createQuizWithQuestions,
        inputSchema: writeToolSchemas.createQuizWithQuestions,
      }),
      createCalendarEvent: tool({
        description: writeToolDescriptions.createCalendarEvent,
        inputSchema: writeToolSchemas.createCalendarEvent,
      }),
      createAssignment: tool({
        description: writeToolDescriptions.createAssignment,
        inputSchema: writeToolSchemas.createAssignment,
      }),
    },
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
