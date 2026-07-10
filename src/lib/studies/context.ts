import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { degreeProgram, userPrefs } from "@/db/schema"

export type StudyContext = {
  programs: { id: string; name: string }[]
  activeProgram: { id: string; name: string } | null
  semesters: { id: string; name: string }[]
  activeSemester: { id: string; name: string } | null
  modules: { id: string; name: string; code: string | null }[]
}

/**
 * Resolves the user's active study context (program → semester → modules)
 * for the sidebar. Falls back to the first program / most recent semester
 * when nothing is selected or the selection was deleted.
 */
export async function getStudyContext(userId: string): Promise<StudyContext> {
  const [prefs, programs] = await Promise.all([
    db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, userId) }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, userId),
      orderBy: [asc(degreeProgram.sortOrder), asc(degreeProgram.createdAt)],
      with: {
        semesters: {
          orderBy: (s) => [asc(s.sortOrder), asc(s.createdAt)],
          with: {
            modules: {
              orderBy: (m) => [asc(m.sortOrder), asc(m.createdAt)],
              columns: { id: true, name: true, code: true },
            },
          },
        },
      },
    }),
  ])

  const activeProgram =
    programs.find((p) => p.id === prefs?.activeProgramId) ?? programs[0] ?? null
  const semesters = activeProgram?.semesters ?? []
  const activeSemester =
    semesters.find((s) => s.id === prefs?.activeSemesterId) ??
    semesters[semesters.length - 1] ??
    null

  return {
    programs: programs.map((p) => ({ id: p.id, name: p.name })),
    activeProgram: activeProgram ? { id: activeProgram.id, name: activeProgram.name } : null,
    semesters: semesters.map((s) => ({ id: s.id, name: s.name })),
    activeSemester: activeSemester ? { id: activeSemester.id, name: activeSemester.name } : null,
    modules: activeSemester?.modules ?? [],
  }
}
