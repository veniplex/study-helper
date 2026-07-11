"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownProgram } from "@/lib/studies/access"

const contextSchema = z.object({
  programId: z.string().min(1),
})

/**
 * Switches the active degree program. The active semester is no longer stored —
 * it is derived from today's date in getStudyContext.
 */
export async function setActiveContext(input: unknown) {
  const session = await requireSession()
  const data = contextSchema.parse(input)
  await ownProgram(data.programId, session.user.id)

  await db
    .insert(userPrefs)
    .values({ userId: session.user.id, activeProgramId: data.programId })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { activeProgramId: data.programId },
    })
  revalidatePath("/", "layout")
  return { ok: true as const }
}
