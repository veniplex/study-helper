import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { assignment, degreeProgram, studyModule } from "@/db/schema"
import type { GoalConfig, GoalGradingRole } from "@/db/schema/studies"
import { moduleFinalGrade, type BonusAssignment, type FinalGrade } from "@/lib/grades"

/** Percent achieved on an assignment, or null when not fully graded. */
function assignmentPercent(achieved: string | null, max: string | null): number | null {
  if (achieved == null || max == null) return null
  const m = Number(max)
  if (!m) return null
  return (Number(achieved) / m) * 100
}

type GoalWithAttempts = {
  gradingRole: GoalGradingRole
  weight: string
  passFail: boolean
  config: GoalConfig
  attempts: { attempt: number; resultPercent: string | null; passed: boolean | null }[]
}

type ModuleWithGrading = {
  goals: GoalWithAttempts[]
  grades: { value: string; weight: string; attempt: number }[]
}

function computeFinal(
  mod: ModuleWithGrading,
  assignments: BonusAssignment[],
  scale: { minPercent: number; grade: number }[] | null
): FinalGrade {
  const gradeGoals = mod.goals
    .filter((g) => g.gradingRole === "grade")
    .map((g) => ({ weight: Number(g.weight), passFail: g.passFail, attempts: g.attempts }))
  const bonus = mod.goals.find((g) => g.gradingRole === "bonus")?.config.bonus ?? null

  return moduleFinalGrade({
    gradeGoals,
    bonus,
    assignments,
    scale,
    legacyGrades: mod.grades,
  })
}

/**
 * Computes each module's final grade for a whole program, reusing goal
 * attempts, graded assignments (for bonus) and legacy grades as a fallback.
 */
export async function getModuleFinalGrades(programId: string): Promise<Map<string, FinalGrade>> {
  const program = await db.query.degreeProgram.findFirst({
    where: eq(degreeProgram.id, programId),
    with: {
      semesters: {
        with: {
          modules: { with: { goals: { with: { attempts: true } }, grades: true } },
        },
      },
    },
  })
  const result = new Map<string, FinalGrade>()
  if (!program) return result

  const modules = program.semesters.flatMap((s) => s.modules)
  const moduleIds = modules.map((m) => m.id)
  const assignments = moduleIds.length
    ? await db.query.assignment.findMany({
        where: inArray(assignment.moduleId, moduleIds),
        columns: { moduleId: true, kind: true, status: true, pointsAchieved: true, pointsMax: true },
      })
    : []

  const byModule = new Map<string, BonusAssignment[]>()
  for (const a of assignments) {
    const list = byModule.get(a.moduleId) ?? []
    list.push({
      kind: a.kind,
      status: a.status,
      percent: assignmentPercent(a.pointsAchieved, a.pointsMax),
    })
    byModule.set(a.moduleId, list)
  }

  for (const mod of modules) {
    result.set(mod.id, computeFinal(mod, byModule.get(mod.id) ?? [], program.gradeScale))
  }
  return result
}

/** Computes a single module's final grade (module page). */
export async function getModuleFinalGrade(moduleId: string): Promise<FinalGrade | null> {
  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    with: {
      goals: { with: { attempts: true } },
      grades: true,
      semester: { with: { program: { columns: { gradeScale: true } } } },
    },
  })
  if (!mod) return null
  const assignments = await db.query.assignment.findMany({
    where: eq(assignment.moduleId, moduleId),
    columns: { kind: true, status: true, pointsAchieved: true, pointsMax: true },
  })
  return computeFinal(
    mod,
    assignments.map((a) => ({
      kind: a.kind,
      status: a.status,
      percent: assignmentPercent(a.pointsAchieved, a.pointsMax),
    })),
    mod.semester.program.gradeScale
  )
}
