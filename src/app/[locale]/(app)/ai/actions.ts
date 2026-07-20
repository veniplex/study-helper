"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { actionError } from "@/lib/action-errors"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

export async function createConversation(
  moduleId?: string | null,
  mode?: string,
  materialId?: string | null
) {
  const session = await requireSession()
  if (moduleId) await ownModule(moduleId, session.user.id)
  let scopedModuleId = moduleId ?? null
  if (materialId) {
    // "Chat with this document": verify ownership and inherit the module.
    const { material } = await import("@/db/schema")
    const row = await db.query.material.findFirst({
      where: and(eq(material.id, materialId), eq(material.userId, session.user.id)),
      columns: { id: true, moduleId: true },
    })
    if (!row) throw new Error("Not found")
    scopedModuleId = scopedModuleId ?? row.moduleId
  }
  const { CHAT_MODES } = await import("@/lib/ai/modes")
  const safeMode = CHAT_MODES.includes(mode as (typeof CHAT_MODES)[number])
    ? (mode as (typeof CHAT_MODES)[number])
    : "general"
  const [created] = await db
    .insert(aiConversation)
    .values({
      userId: session.user.id,
      moduleId: scopedModuleId,
      materialId: materialId ?? null,
      mode: safeMode,
    })
    .returning({ id: aiConversation.id })
  revalidatePath("/ai")
  return { ok: true as const, id: created.id }
}

/** Changes the tutor mode of an existing conversation. */
export async function updateConversationMode(conversationId: string, mode: string) {
  const session = await requireSession()
  const { CHAT_MODES } = await import("@/lib/ai/modes")
  if (!CHAT_MODES.includes(mode as (typeof CHAT_MODES)[number])) throw new Error("Unknown mode")
  await db
    .update(aiConversation)
    .set({ mode })
    .where(
      and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, session.user.id))
    )
  revalidatePath("/ai")
  return { ok: true as const }
}

/** Whether voice input (speech-to-text) is available for this user. */
export async function isVoiceInputAvailable(): Promise<boolean> {
  const session = await requireSession()
  const { getTranscriptionModel } = await import("@/lib/ai/registry")
  return Boolean(await getTranscriptionModel(session.user.id))
}

/** Transcribes a short voice recording from the chat input (max 10 MB). */
export async function transcribeVoiceInput(formData: FormData) {
  const session = await requireSession()
  const file = formData.get("audio")
  if (!(file instanceof Blob)) throw new Error("No audio")
  if (file.size > 10 * 1024 * 1024) throw new Error("Recording too large")
  const { assertAiAllowed } = await import("@/lib/ai/usage")
  await assertAiAllowed(session.user.id)
  const { transcribeAudioBuffer } = await import("@/lib/ai/media")
  const text = await transcribeAudioBuffer(
    new Uint8Array(await file.arrayBuffer()),
    session.user.id
  )
  return { text }
}

/** Explains a highlighted passage from one of the user's materials. */
export async function explainSnippet(materialId: string, snippet: string, context?: string) {
  const session = await requireSession()
  const cleanSnippet = snippet.trim().slice(0, 4000)
  if (!cleanSnippet) throw new Error("Nothing selected")
  const { material } = await import("@/db/schema")
  const row = await db.query.material.findFirst({
    where: and(eq(material.id, materialId), eq(material.userId, session.user.id)),
    columns: { id: true, name: true },
  })
  if (!row) throw new Error("Not found")
  const { assertAiAllowed } = await import("@/lib/ai/usage")
  await assertAiAllowed(session.user.id)
  const { resolveModelForUser, getLanguageModel } = await import("@/lib/ai/registry")
  const modelRef = await resolveModelForUser(session.user.id)
  if (!modelRef) actionError("AI_NO_MODEL")
  const model = await getLanguageModel(modelRef, session.user.id)
  const { generateText } = await import("ai")
  const { GEN_PARAMS } = await import("@/lib/ai/params")
  const { runAi } = await import("@/lib/ai/run")
  const { text } = await runAi(
    {
      userId: session.user.id,
      model: modelRef,
      feature: "explain",
      entityType: "material",
      entityId: row.id,
      entityLabel: row.name,
    },
    () =>
      generateText({
        model,
        ...GEN_PARAMS,
        maxOutputTokens: 800,
        prompt: `You are a study tutor. Explain the highlighted passage from the document "${row.name}" clearly and concisely for a university student: what it means, why it matters, and any term worth defining. Use Markdown, max ~150 words, answer in the language of the passage.

Highlighted passage:
${cleanSnippet}
${context ? `\nSurrounding page text (context only):\n${context.slice(0, 4000)}` : ""}`,
      })
  )
  return { explanation: text }
}

/** Load a conversation's messages (used by the floating quick chat). Returns null if not found. */
export async function getConversationMessages(conversationId: string) {
  const session = await requireSession()
  const conversation = await db.query.aiConversation.findFirst({
    where: and(
      eq(aiConversation.id, conversationId),
      eq(aiConversation.userId, session.user.id)
    ),
    with: { messages: { orderBy: (m, { asc }) => [asc(m.createdAt)] } },
  })
  if (!conversation) return null
  return conversation.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts,
  }))
}

/** Recent conversations for the chat dock switcher. */
export async function listConversations() {
  const session = await requireSession()
  const rows = await db.query.aiConversation.findMany({
    where: eq(aiConversation.userId, session.user.id),
    orderBy: (c, { desc }) => [desc(c.updatedAt)],
    limit: 30,
    with: { module: { columns: { id: true, name: true } } },
  })
  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    moduleName: c.module?.name ?? null,
    moduleId: c.moduleId,
    mode: c.mode,
    updatedAt: c.updatedAt.toISOString(),
  }))
}

export async function renameConversation(conversationId: string, title: string) {
  const session = await requireSession()
  const clean = title.trim().slice(0, 200)
  if (!clean) throw new Error("Title required")
  await db
    .update(aiConversation)
    .set({ title: clean })
    .where(
      and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, session.user.id))
    )
  revalidatePath("/ai")
  return { ok: true as const }
}

export async function updateConversationModule(
  conversationId: string,
  moduleId: string | null
) {
  const session = await requireSession()
  if (moduleId) await ownModule(moduleId, session.user.id)
  await db
    .update(aiConversation)
    .set({ moduleId })
    .where(
      and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, session.user.id))
    )
  revalidatePath("/ai")
  return { ok: true as const }
}

/** Runs a user-confirmed AI write tool (called from the confirmation card). */
export async function executeAiTool(
  name: string,
  input: unknown,
  conversationId?: string
) {
  const session = await requireSession()
  const { WRITE_TOOL_NAMES } = await import("@/lib/ai/tools")
  const { executeWriteTool } = await import("@/lib/ai/tool-executors")
  if (!WRITE_TOOL_NAMES.includes(name as (typeof WRITE_TOOL_NAMES)[number])) {
    throw new Error("Unknown tool")
  }
  const result = await executeWriteTool(
    name as (typeof WRITE_TOOL_NAMES)[number],
    input,
    session.user.id,
    conversationId ?? null
  )
  revalidatePath("/", "layout")
  return result
}

export async function deleteConversation(conversationId: string) {
  const session = await requireSession()
  await db
    .delete(aiConversation)
    .where(
      and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, session.user.id))
    )
  revalidatePath("/ai")
  return { ok: true as const }
}
