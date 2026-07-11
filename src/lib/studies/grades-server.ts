import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { assignment, degreeProgram, studyModule } from "@/db/schema"
import { moduleFinalGrade, type BonusAssignment, type FinalGrade } from "@/lib/grades"

/** Percent achieved on an assignment, or null when not fully graded. */
function assignmentPercent(achieved: string | null, max: string | null): number | null {
  if (achieved == null || max == null) return null
  const m = Number(max)
  if (!m) return null
  return (Number(achieved) / m) * 100
}

type ModuleWithGrading = {
  id: string
  passFail: boolean
  bonusType: "none" | "percent_points" | "grade_steps"
  bonusValue: string | null
  bonusMinAvgPercent: string | null
  bonusMinCompletedShare: string | null
  assessment: { attempts: { attempt: number; resultPercent: string | null; passed: boolean | null }[] } | null
  grades: { value: string; weight: string; attempt: number }[]
}

function computeFinal(
  mod: ModuleWithGrading,
  assignments: BonusAssignment[],
  scale: { minPercent: number; grade: number }[] | null
): FinalGrade {
  return moduleFinalGrade({
    module: mod,
    attempts: mod.assessment?.attempts ?? [],
    assignments,
    scale,
    legacyGrades: mod.grades,
  })
}

/**
 * Computes each module's final grade for a whole program, reusing assessment
 * attempts, graded assignments (for bonus) and legacy grades as a fallback.
 */
export async function getModuleFinalGrades(programId: string): Promise<Map<string, FinalGrade>> {
  const program = await db.query.degreeProgram.findFirst({
    where: eq(degreeProgram.id, programId),
    with: {
      semesters: {
        with: {
          modules: { with: { assessment: { with: { attempts: true } }, grades: true } },
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
      assessment: { with: { attempts: true } },
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
