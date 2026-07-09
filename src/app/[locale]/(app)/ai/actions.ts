"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"

export async function createConversation(moduleId?: string | null) {
  const session = await requireSession()
  if (moduleId) await ownModule(moduleId, session.user.id)
  const [created] = await db
    .insert(aiConversation)
    .values({ userId: session.user.id, moduleId: moduleId ?? null })
    .returning({ id: aiConversation.id })
  revalidatePath("/ai")
  return { ok: true as const, id: created.id }
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
