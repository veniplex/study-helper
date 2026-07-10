import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { degreeProgram } from "@/db/schema"

export type ModuleOption = { id: string; name: string }

export async function getModuleOptions(userId: string): Promise<ModuleOption[]> {
  const programs = await db.query.degreeProgram.findMany({
    where: eq(degreeProgram.userId, userId),
    with: { semesters: { with: { modules: true } } },
  })
  return programs.flatMap((p) =>
    p.semesters.flatMap((s) => s.modules.map((m) => ({ id: m.id, name: m.name })))
  )
}
