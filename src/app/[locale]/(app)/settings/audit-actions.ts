"use server"

import { revalidatePath } from "next/cache"
import { requireSession } from "@/lib/auth/session"
import { undoAudit } from "@/lib/audit"

export async function undoAuditEntry(entryId: string) {
  const session = await requireSession()
  await undoAudit(entryId, session.user.id)
  revalidatePath("/", "layout")
  return { ok: true as const }
}
