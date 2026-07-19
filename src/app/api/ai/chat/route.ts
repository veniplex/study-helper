import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai"
import { z } from "zod"
import { and, asc, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation, aiMessage, studyEvent } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import {
  getLanguageModel,
  listAvailableModels,
  userHasUsableKeyForModel,
} from "@/lib/ai/registry"
import { assertWithinLimit, isOverLimit } from "@/lib/ai/usage"
import { normalizeUsage, recordAiAudit, recordAiUsage } from "@/lib/ai/run"
import { searchChunks, searchChunksInMaterials } from "@/lib/ai/rag"
import { MODE_PROMPTS, type ChatMode } from "@/lib/ai/modes"
import { writeToolDescriptions, writeToolSchemas, WRITE_TOOL_NAMES } from "@/lib/ai/tools"
import { mergeToolOutputs } from "@/lib/ai/chat-history"
import { CHAT_PARAMS } from "@/lib/ai/params"
import { getStudyContext } from "@/lib/studies/context"
import { getModuleDetail } from "@/lib/studies/module-detail"
import { formatGoalContext, getModuleGoalContext } from "@/lib/studies/goal-context"
import { getModuleFinalGrades } from "@/lib/studies/grades-server"
import { getSetting } from "@/lib/settings"

export const maxDuration = 300

/** Bound on a single user message (sum of its text parts). */
const MAX_USER_MESSAGE_CHARS = 32_000
/** History window sent to the model — the DB keeps the full conversation. */
const MAX_HISTORY_MESSAGES = 40

const LOCALE_NAMES: Record<string, string> = { de: "German", en: "English" }

type StoredMessage = { id: string; role: "user" | "assistant" | "system"; parts: UIMessage["parts"] }

function buildSystemPrompt(
  moduleName: string | null | undefined,
  moduleId: string | null | undefined,
  ragEnabled: boolean,
  mode: ChatMode,
  pageContext?: string,
  locale?: string,
  documentName?: string | null,
  goalContext?: string
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
    goalContext ?? "",
    MODE_PROMPTS[mode] ?? "",
    documentName
      ? `This conversation is about ONE specific document: "${documentName}". The searchMaterials tool searches only inside this document — use it for every content question, and answer from this document rather than general knowledge.`
      : "",
    ragEnabled
      ? "You can search the user's uploaded study materials with the searchMaterials tool. Use it whenever a question may relate to their course content. Each search result carries an index; when your answer uses a result, cite it inline as [n] with that index."
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

  // Reject oversized bodies before buffering them: `request.json()` reads the
  // whole payload into memory, so the per-message char/history caps below apply
  // too late to stop a huge upload. The real message cap is ~32k chars; 1 MB
  // leaves generous headroom for JSON/attachment overhead.
  const MAX_BODY_BYTES = 1_000_000
  const contentLength = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 })
  }

  const body = (await request.json().catch(() => null)) as {
    messages: UIMessage[]
    conversationId: string
    model: string
    pageContext?: string
    locale?: string
    /** Set by the AI SDK transport: "submit-message" | "regenerate-message". */
    trigger?: string
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
    with: { module: true, material: { columns: { id: true, name: true } } },
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

  // The DB is the source of truth for the conversation history — the client
  // only contributes its latest message. Trusting the full client-supplied
  // history would let a request spoof prior assistant turns and carry an
  // unbounded number of tokens to the model.
  const stored = (await db.query.aiMessage.findMany({
    where: eq(aiMessage.conversationId, conversation.id),
    orderBy: [asc(aiMessage.createdAt)],
    columns: { id: true, role: true, parts: true },
  })) as StoredMessage[]
  const history: UIMessage[] = stored.map((m) => ({ id: m.id, role: m.role, parts: m.parts }))

  const lastMessage = body.messages.at(-1)
  if (body.trigger === "regenerate-message") {
    // Regenerate the last answer: drop the trailing assistant message(s) and
    // re-stream from the preceding user turn. Refused when an executed write
    // tool is part of that answer — its side effect (deck/quiz/event) already
    // exists and would be offered again.
    const { isWriteToolPart } = await import("@/lib/ai/chat-history")
    const poppedIds: string[] = []
    while (history.length > 0 && history.at(-1)!.role === "assistant") {
      const popped = history.pop()!
      const executed = popped.parts.some(
        (p) =>
          isWriteToolPart(p) &&
          p.state === "output-available" &&
          (p.output as { status?: string } | undefined)?.status === "executed"
      )
      if (executed) {
        return new Response("Cannot regenerate an answer with executed actions", { status: 409 })
      }
      poppedIds.push(popped.id)
    }
    if (poppedIds.length === 0 || history.at(-1)?.role !== "user") {
      return new Response("Nothing to regenerate", { status: 400 })
    }
    await db.delete(aiMessage).where(inArray(aiMessage.id, poppedIds))
    await db
      .update(aiConversation)
      .set({ model: body.model, updatedAt: new Date() })
      .where(eq(aiConversation.id, conversation.id))
  } else if (lastMessage?.role === "user") {
    // New user turn: keep only text parts and bound their size.
    const textParts = lastMessage.parts.filter(
      (p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string"
    )
    const totalChars = textParts.reduce((n, p) => n + p.text.length, 0)
    if (textParts.length === 0 || totalChars === 0) {
      return new Response("Empty message", { status: 400 })
    }
    if (totalChars > MAX_USER_MESSAGE_CHARS) {
      return new Response("Message too long", { status: 413 })
    }
    const [inserted] = await db
      .insert(aiMessage)
      .values({ conversationId: conversation.id, role: "user", parts: textParts })
      .returning({ id: aiMessage.id })
    history.push({ id: inserted.id, role: "user", parts: textParts })

    // Derive a placeholder title from the first user message; upgraded to an
    // AI-written title after the first exchange completes (see onFinish).
    if (conversation.title === "New conversation") {
      const text = textParts
        .map((p) => p.text)
        .join(" ")
        .slice(0, 80)
      await db
        .update(aiConversation)
        .set({ title: text, model: body.model })
        .where(eq(aiConversation.id, conversation.id))
    } else {
      await db
        .update(aiConversation)
        .set({ model: body.model, updatedAt: new Date() })
        .where(eq(aiConversation.id, conversation.id))
    }
  } else if (lastMessage?.role === "assistant") {
    // Tool-confirmation continuation (sendAutomaticallyWhen): adopt the
    // executed/rejected outcomes for the pending write-tool calls of the last
    // stored assistant message, then let the model continue.
    const lastStored = stored.at(-1)
    if (!lastStored || lastStored.role !== "assistant") {
      return new Response("Nothing to continue", { status: 400 })
    }
    const { parts, changed } = mergeToolOutputs(lastStored.parts, lastMessage.parts)
    if (!changed) {
      return new Response("Nothing to continue", { status: 400 })
    }
    await db.update(aiMessage).set({ parts }).where(eq(aiMessage.id, lastStored.id))
    history[history.length - 1] = { id: lastStored.id, role: "assistant", parts }
    await db
      .update(aiConversation)
      .set({ model: body.model, updatedAt: new Date() })
      .where(eq(aiConversation.id, conversation.id))
  } else {
    return new Response("Invalid last message", { status: 400 })
  }

  const windowedHistory = history.slice(-MAX_HISTORY_MESSAGES)

  const ai = await getSetting("ai")
  const ragEnabled = Boolean(ai?.defaultEmbeddingModel)
  const userId = session.user.id
  // Whether this user can authenticate a request for the chosen model. Computed
  // up front so the synchronous stream `onError` can tell a BYOK dead-end (no
  // usable key → point the user at Settings) apart from a genuine auth failure
  // on a configured key (F4).
  const canAuthModel = await userHasUsableKeyForModel(body.model, userId)
  const moduleId = conversation.moduleId
  const scopedMaterialId = conversation.materialId

  // Goal-aware chat: describe the module's learning goals in the system prompt
  // and, when the user hasn't picked a mode, derive an effective default from
  // the goals (never persisted — the stored mode always wins once set).
  const storedMode = (conversation.mode as ChatMode) ?? "general"
  let effectiveMode = storedMode
  let goalContextText = ""
  if (moduleId) {
    const goalCtx = await getModuleGoalContext(moduleId)
    goalContextText = formatGoalContext(goalCtx)
    if (storedMode === "general" && goalCtx.goals.length > 0) {
      const inWritingPhase =
        goalCtx.writingPhase === "writing" || goalCtx.writingPhase === "revision"
      if ((goalCtx.hasTermPaper || goalCtx.hasThesis) && inWritingPhase) {
        effectiveMode = "writing"
      } else if (goalCtx.hasThesis) {
        effectiveMode = "thesis"
      }
    }
  }
  // Citation counter shared across all searchMaterials calls of this response
  // so [n] indices stay unique within one assistant turn.
  let citationIndex = 0

  const result = streamText({
    model,
    ...CHAT_PARAMS,
    system: buildSystemPrompt(
      conversation.module?.name,
      conversation.moduleId,
      ragEnabled,
      effectiveMode,
      pageContext,
      locale,
      conversation.material?.name ?? null,
      goalContextText
    ),
    // Incomplete write-tool calls (user typed on without confirming) are
    // dropped so providers don't reject the dangling tool_use.
    messages: await convertToModelMessages(windowedHistory, {
      ignoreIncompleteToolCalls: true,
    }),
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
                // Document-scoped conversations retrieve from that one material;
                // otherwise search the conversation's module (or everything).
                const hits = scopedMaterialId
                  ? await searchChunksInMaterials(userId, query, [scopedMaterialId], { limit: 6 })
                  : await searchChunks(userId, query, { moduleId, limit: 6 })
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
                // The index lets the model cite [n]; materialId lets the UI
                // render the citation as a link to the source material.
                return hits.map((h) => ({
                  index: ++citationIndex,
                  source: h.materialName,
                  materialId: h.materialId,
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
            ctx.activeProgram
              ? getModuleFinalGrades(ctx.activeProgram.id)
              : Promise.resolve(new Map()),
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
                goalTypes: m.goals.map((g) => g.type),
                nextDueDate:
                  m.goals
                    .map((g) => g.dueDate)
                    .filter((d): d is string => d != null)
                    .sort()[0] ?? null,
              })),
            })),
            upcomingEvents: events,
          }
        },
      }),
      getModuleDetails: tool({
        description:
          "Get everything about ONE module: status, ECTS, its learning goals (exams, papers, assignments — each with type, title, grading role, deadline and attempts), computed final grade, assignment bonus progress, contacts, assignments, upcoming events and deck/quiz counts. Pass the module id from getContext.",
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
      const usage = normalizeUsage(totalUsage)
      const ctx = {
        userId,
        model: body.model,
        feature: "chat",
        moduleId,
        conversationId: conversation.id,
        entityType: "conversation",
        entityId: conversation.id,
        entityLabel: conversation.title,
      }
      await recordAiUsage(ctx, usage)
      await recordAiAudit(ctx, usage)
    },
  })

  // Drain the stream server-side even if the client disconnects mid-response,
  // so the assistant message and usage logging always land in the DB and the
  // stored history can't diverge from what the user was shown.
  void Promise.resolve(result.consumeStream()).catch(() => {})

  return result.toUIMessageStreamResponse({
    // Categorize provider failures for the client (which maps the codes onto
    // translated messages) without leaking raw provider/stack details.
    onError: (error) => {
      console.error("[chat] stream error", error)
      const message = error instanceof Error ? error.message : String(error)
      if (/api.?key|unauthorized|authentication|401|403/i.test(message)) {
        // No usable key for this provider → actionable setup hint (F4); an auth
        // failure on a configured key stays the generic provider-rejected code.
        return canAuthModel ? "AI_ERROR:auth" : "AI_ERROR:no-key"
      }
      if (/rate.?limit|quota|429|overloaded/i.test(message)) return "AI_ERROR:rate-limit"
      return "AI_ERROR:generic"
    },
    onFinish: async ({ responseMessage }) => {
      // A failed stream can produce an empty assistant message — persisting it
      // would litter the conversation with blank turns.
      const hasContent = responseMessage.parts.some(
        (p) =>
          (p.type === "text" && p.text.trim().length > 0) ||
          (typeof p.type === "string" && p.type.startsWith("tool-"))
      )
      if (!hasContent) return
      await db.insert(aiMessage).values({
        conversationId: conversation.id,
        role: "assistant",
        parts: responseMessage.parts,
      })
      // First exchange of a fresh conversation: replace the truncated
      // placeholder title with a short AI-written one (best-effort).
      if (conversation.title === "New conversation") {
        const firstUser = windowedHistory.find((m) => m.role === "user")
        const userText = firstUser?.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
        const answerText = responseMessage.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
        // Title generation is a paid model call; degrade gracefully over the
        // monthly cap by keeping the truncated placeholder title.
        if (userText && !(await isOverLimit(userId))) {
          try {
            const { generateText } = await import("ai")
            const { UTILITY_PARAMS } = await import("@/lib/ai/params")
            const { text } = await generateText({
              model,
              ...UTILITY_PARAMS,
              maxOutputTokens: 30,
              prompt: `Write a short title (max 6 words, no quotes, same language as the conversation) for this chat.\nUser: ${userText.slice(0, 500)}\nAssistant: ${answerText.slice(0, 500)}`,
            })
            const title = text.trim().replace(/^["'«»\s]+|["'«»\s.]+$/g, "").slice(0, 80)
            if (title) {
              await db
                .update(aiConversation)
                .set({ title })
                .where(eq(aiConversation.id, conversation.id))
            }
          } catch (error) {
            console.error("[chat] title generation failed", error)
          }
        }
      }
    },
  })
}
