"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { semester, userPrefs } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownProgram, ownSemester } from "@/lib/studies/access"

const contextSchema = z.object({
  programId: z.string().min(1),
  semesterId: z.string().optional().nullable(),
})

export async function setActiveContext(input: unknown) {
  const session = await requireSession()
  const data = contextSchema.parse(input)
  await ownProgram(data.programId, session.user.id)

  let semesterId = data.semesterId ?? null
  if (semesterId) {
    const sem = await ownSemester(semesterId, session.user.id)
    if (sem.programId !== data.programId) semesterId = null
  }
  if (!semesterId) {
    // default to the latest semester of the program
    const sems = await db.query.semester.findMany({
      where: eq(semester.programId, data.programId),
      orderBy: (s, { asc }) => [asc(s.sortOrder), asc(s.createdAt)],
    })
    semesterId = sems.at(-1)?.id ?? null
  }

  await db
    .insert(userPrefs)
    .values({
      userId: session.user.id,
      activeProgramId: data.programId,
      activeSemesterId: semesterId,
    })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { activeProgramId: data.programId, activeSemesterId: semesterId },
    })
  revalidatePath("/", "layout")
  return { ok: true as const }
}
