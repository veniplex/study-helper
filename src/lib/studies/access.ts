import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { degreeProgram, semester, studyModule } from "@/db/schema"

/** Throws if the program does not belong to the user. Returns the program. */
export async function ownProgram(programId: string, userId: string) {
  const program = await db.query.degreeProgram.findFirst({
    where: and(eq(degreeProgram.id, programId), eq(degreeProgram.userId, userId)),
  })
  if (!program) throw new Error("Not found")
  return program
}

/** Throws if the semester's program does not belong to the user. */
export async function ownSemester(semesterId: string, userId: string) {
  const sem = await db.query.semester.findFirst({
    where: eq(semester.id, semesterId),
    with: { program: true },
  })
  if (!sem || sem.program.userId !== userId) throw new Error("Not found")
  return sem
}

/** Throws if the module's program does not belong to the user. */
export async function ownModule(moduleId: string, userId: string) {
  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: { semester: { with: { program: true } } },
  })
  if (!mod || mod.semester.program.userId !== userId) throw new Error("Not found")
  return mod
}
