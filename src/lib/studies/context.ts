import "server-only"
import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { degreeProgram, userPrefs, writingProject } from "@/db/schema"
import type { GoalGradingRole, GoalType } from "@/db/schema/studies"
import { hasGoal } from "@/lib/studies/goals"

export type SemesterModuleGoal = {
  type: GoalType
  title: string | null
  gradingRole: GoalGradingRole
  passFail: boolean
  dueDate: string | null
}

export type SemesterModule = {
  id: string
  name: string
  code: string | null
  ects: number | null
  instructor: string | null
  status: "planned" | "active" | "passed" | "failed"
  notes: string | null
  icon: string | null
  color: string | null
  /** The module's learning goals (drives workspace + thesis derivation). */
  goals: SemesterModuleGoal[]
  /** Derived label for compact lists: the primary grade goal's title. */
  examType: string | null
  /** Derived: the module carries a `thesis` goal (special module). */
  isThesis: boolean
}

export type SemesterNode = {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  modules: SemesterModule[]
  theses: { id: string; title: string }[]
}

export type ProgramInfo = {
  id: string
  name: string
  degreeType: string | null
  institution: string | null
  targetEcts: number | null
  gradingSystem: "german" | "points" | "passfail"
  gradeGoal: string | null
}

export type StudyContext = {
  programs: ProgramInfo[]
  activeProgram: { id: string; name: string } | null
  semesters: { id: string; name: string }[]
  activeSemester: { id: string; name: string } | null
  /** Semester whose date range contains today, if any (sidebar default-open). */
  currentSemesterId: string | null
  modules: { id: string; name: string; code: string | null }[]
  /** Full semester → modules/theses tree of the active program (sidebar). */
  tree: SemesterNode[]
}

/**
 * Resolves the user's active study context (program → semester → modules)
 * for the sidebar. Falls back to the first program / most recent semester
 * when nothing is selected or the selection was deleted.
 */
export async function getStudyContext(userId: string): Promise<StudyContext> {
  const [prefs, programs, theses] = await Promise.all([
    db.query.userPrefs.findFirst({ where: eq(userPrefs.userId, userId) }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, userId),
      orderBy: [asc(degreeProgram.sortOrder), asc(degreeProgram.createdAt)],
      with: {
        // Semesters are always shown oldest → newest by their date range
        // (undated semesters sort last), never by manual order.
        semesters: {
          orderBy: (s) => [asc(sql`coalesce(${s.startDate}, '9999-12-31')`), asc(s.createdAt)],
          with: {
            modules: {
              orderBy: (m) => [asc(m.sortOrder), asc(m.createdAt)],
              columns: {
                id: true,
                name: true,
                code: true,
                ects: true,
                instructor: true,
                status: true,
                notes: true,
                icon: true,
                color: true,
              },
              with: {
                goals: {
                  orderBy: (g) => [asc(g.sortOrder), asc(g.createdAt)],
                  columns: {
                    type: true,
                    title: true,
                    gradingRole: true,
                    passFail: true,
                    dueDate: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.query.writingProject.findMany({
      where: and(eq(writingProject.userId, userId), eq(writingProject.kind, "thesis")),
      columns: { id: true, title: true, semesterId: true },
    }),
  ])

  const activeProgram =
    programs.find((p) => p.id === prefs?.activeProgramId) ?? programs[0] ?? null
  const semesters = activeProgram?.semesters ?? []
  // The "active" semester is derived from today's date (the one whose range
  // contains today), falling back to the most recent — no stored selection.
  const today = new Date().toISOString().slice(0, 10)
  const currentSemester =
    semesters.find((s) => s.startDate && s.endDate && s.startDate <= today && today <= s.endDate) ??
    null
  const activeSemester = currentSemester ?? semesters[semesters.length - 1] ?? null

  return {
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      degreeType: p.degreeType,
      institution: p.institution,
      targetEcts: p.targetEcts,
      gradingSystem: p.gradingSystem,
      gradeGoal: p.gradeGoal,
    })),
    activeProgram: activeProgram ? { id: activeProgram.id, name: activeProgram.name } : null,
    semesters: semesters.map((s) => ({ id: s.id, name: s.name })),
    activeSemester: activeSemester ? { id: activeSemester.id, name: activeSemester.name } : null,
    currentSemesterId: currentSemester?.id ?? null,
    modules: activeSemester?.modules ?? [],
    tree: (activeProgram?.semesters ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      modules: s.modules.map((m) => {
        const gradeGoal = m.goals.find((g) => g.gradingRole === "grade") ?? m.goals[0] ?? null
        return {
          id: m.id,
          name: m.name,
          code: m.code,
          ects: m.ects,
          instructor: m.instructor,
          status: m.status,
          notes: m.notes,
          icon: m.icon,
          color: m.color,
          goals: m.goals,
          examType: gradeGoal?.title ?? null,
          isThesis: hasGoal(m.goals, "thesis"),
        }
      }),
      theses: theses
        .filter((t) => t.semesterId === s.id)
        .map((t) => ({ id: t.id, title: t.title })),
    })),
  }
}
