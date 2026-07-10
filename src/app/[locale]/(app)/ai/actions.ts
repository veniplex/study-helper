"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

export async function createConversation(moduleId?: string | null, mode?: string) {
  const session = await requireSession()
  if (moduleId) await ownModule(moduleId, session.user.id)
  const { CHAT_MODES } = await import("@/lib/ai/modes")
  const safeMode = CHAT_MODES.includes(mode as (typeof CHAT_MODES)[number])
    ? (mode as (typeof CHAT_MODES)[number])
    : "general"
  const [created] = await db
    .insert(aiConversation)
    .values({ userId: session.user.id, moduleId: moduleId ?? null, mode: safeMode })
    .returning({ id: aiConversation.id })
  revalidatePath("/ai")
  return { ok: true as const, id: created.id }
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
export async function executeAiTool(name: string, input: unknown) {
  const session = await requireSession()
  const { WRITE_TOOL_NAMES } = await import("@/lib/ai/tools")
  const { executeWriteTool } = await import("@/lib/ai/tool-executors")
  if (!WRITE_TOOL_NAMES.includes(name as (typeof WRITE_TOOL_NAMES)[number])) {
    throw new Error("Unknown tool")
  }
  const result = await executeWriteTool(
    name as (typeof WRITE_TOOL_NAMES)[number],
    input,
    session.user.id
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
