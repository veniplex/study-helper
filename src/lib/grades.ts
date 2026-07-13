import type {
  BonusType,
  GradeScaleRow,
  GradingSystem,
  ModuleStatus,
} from "@/db/schema/studies"
import type { AssignmentKind, AssignmentStatus } from "@/db/schema/assignments"

export type ModuleForStats = {
  ects: number | null
  status: ModuleStatus
  grades: { value: string; weight: string; attempt: number }[]
}

/**
 * Final grade of a module: weighted average of the grades of the highest
 * attempt (a retake replaces earlier attempts).
 */
export function moduleGrade(grades: ModuleForStats["grades"]): number | null {
  if (grades.length === 0) return null
  const maxAttempt = Math.max(...grades.map((g) => g.attempt))
  const relevant = grades.filter((g) => g.attempt === maxAttempt)
  const totalWeight = relevant.reduce((sum, g) => sum + Number(g.weight), 0)
  if (totalWeight === 0) return null
  return relevant.reduce((sum, g) => sum + Number(g.value) * Number(g.weight), 0) / totalWeight
}

/** ECTS-weighted average over all graded modules. */
export function programAverage(modules: ModuleForStats[]): number | null {
  let weightedSum = 0
  let totalEcts = 0
  for (const m of modules) {
    const g = moduleGrade(m.grades)
    if (g == null) continue
    const ects = m.ects ?? 0
    if (ects === 0) continue
    weightedSum += g * ects
    totalEcts += ects
  }
  if (totalEcts === 0) return null
  return weightedSum / totalEcts
}

/** Sum of ECTS of passed modules. */
export function earnedEcts(modules: ModuleForStats[]): number {
  return modules
    .filter((m) => m.status === "passed")
    .reduce((sum, m) => sum + (m.ects ?? 0), 0)
}

export function formatGrade(value: number | null, system: GradingSystem): string {
  if (value == null) return "–"
  switch (system) {
    case "german":
      return value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case "points":
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    case "passfail":
      return value <= 0 ? "✓" : "✗"
  }
}

// ── Percent-based grading (Runde 8) ──────────────────────────────────────────

/** Default German percent→grade scale (IHK-style). null gradeScale uses this. */
export const DEFAULT_GERMAN_SCALE: GradeScaleRow[] = [
  { minPercent: 95, grade: 1.0 },
  { minPercent: 90, grade: 1.3 },
  { minPercent: 85, grade: 1.7 },
  { minPercent: 80, grade: 2.0 },
  { minPercent: 75, grade: 2.3 },
  { minPercent: 70, grade: 2.7 },
  { minPercent: 65, grade: 3.0 },
  { minPercent: 60, grade: 3.3 },
  { minPercent: 55, grade: 3.7 },
  { minPercent: 50, grade: 4.0 },
]

/** Grade returned when a percentage falls below every scale row. */
export const FAIL_GRADE = 5.0
/** Best (numerically lowest) grade a bonus can improve toward. */
export const BEST_GRADE = 1.0
/** A module counts as passed at this grade or better. */
export const PASS_THRESHOLD = 4.0

/** Maps a percentage to a grade via the (sorted-desc) scale; below all → 5.0. */
export function percentToGrade(scale: GradeScaleRow[] | null, percent: number): number {
  const rows = [...(scale && scale.length > 0 ? scale : DEFAULT_GERMAN_SCALE)].sort(
    (a, b) => b.minPercent - a.minPercent
  )
  for (const row of rows) if (percent >= row.minPercent) return row.grade
  return FAIL_GRADE
}

export type BonusModule = {
  bonusType: BonusType
  bonusValue: string | number | null
  bonusMinAvgPercent: string | number | null
  bonusMinCompletedShare: string | number | null
}

export type BonusAssignment = {
  kind: AssignmentKind
  status: AssignmentStatus
  /** Achieved result as a percentage (0..100), or null if not graded yet. */
  percent: number | null
}

export type BonusResult = {
  percentPoints: number
  gradeSteps: number
  conditionMet: boolean
  avgPercent: number
  completedShare: number
  gradedCount: number
  completedCount: number
}

const num = (v: string | number | null | undefined): number | null =>
  v == null || v === "" ? null : Number(v)

/** Computes the bonus a module's completed graded assignments earn. */
export function effectiveBonus(
  module: BonusModule,
  assignments: BonusAssignment[]
): BonusResult {
  const graded = assignments.filter((a) => a.kind === "graded")
  const completed = graded.filter((a) => a.status === "graded" && a.percent != null)
  const avgPercent = completed.length
    ? completed.reduce((s, a) => s + (a.percent ?? 0), 0) / completed.length
    : 0
  const completedShare = graded.length ? completed.length / graded.length : 0

  const minAvg = num(module.bonusMinAvgPercent)
  const minShare = num(module.bonusMinCompletedShare)
  const value = num(module.bonusValue) ?? 0
  const conditionMet =
    module.bonusType !== "none" &&
    (minAvg == null || avgPercent >= minAvg) &&
    (minShare == null || completedShare >= minShare)

  return {
    percentPoints: conditionMet && module.bonusType === "percent_points" ? value : 0,
    gradeSteps: conditionMet && module.bonusType === "grade_steps" ? value : 0,
    conditionMet,
    avgPercent,
    completedShare,
    gradedCount: graded.length,
    completedCount: completed.length,
  }
}

export type FinalGradeAttempt = {
  attempt: number
  resultPercent: string | number | null
  passed: boolean | null
}

export type FinalGradeInput = {
  module: { passFail: boolean } & BonusModule
  attempts: FinalGradeAttempt[]
  assignments: BonusAssignment[]
  scale: GradeScaleRow[] | null
  legacyGrades?: ModuleForStats["grades"]
}

export type FinalGrade = {
  grade: number | null
  percent: number | null
  passed: boolean | null
  attempt: number | null
  source: "assessment" | "legacy" | null
  bonus: BonusResult | null
}

/**
 * Computes a module's final grade from its latest assessment attempt (achieved
 * percentage → grade scale), falling back to legacy free-form grades when no
 * attempt exists. The assignment bonus is computed and returned for display but
 * does not alter the final grade. Pass/fail modules yield only a passed flag.
 */
export function moduleFinalGrade(input: FinalGradeInput): FinalGrade {
  const { module, attempts, assignments, scale, legacyGrades } = input

  if (attempts.length > 0) {
    const latest = attempts.reduce((a, b) => (b.attempt >= a.attempt ? b : a))
    const bonus = effectiveBonus(module, assignments)

    if (module.passFail) {
      return {
        grade: null,
        percent: num(latest.resultPercent),
        passed: latest.passed,
        attempt: latest.attempt,
        source: "assessment",
        bonus,
      }
    }

    const basePercent = num(latest.resultPercent)
    if (basePercent != null) {
      // The final grade is derived purely from the achieved percentage via the
      // grade scale. A configured assignment bonus is reported for information
      // only (see `bonus` below) and never shifts the final grade.
      const grade = percentToGrade(scale, basePercent)
      return {
        grade,
        percent: basePercent,
        passed: grade <= PASS_THRESHOLD,
        attempt: latest.attempt,
        source: "assessment",
        bonus,
      }
    }

    // Attempt exists but no percentage recorded yet.
    return {
      grade: null,
      percent: null,
      passed: latest.passed,
      attempt: latest.attempt,
      source: "assessment",
      bonus,
    }
  }

  // Legacy fallback: pre-Runde-8 free-form grade rows.
  if (legacyGrades && legacyGrades.length > 0) {
    const grade = moduleGrade(legacyGrades)
    return {
      grade,
      percent: null,
      passed: grade == null ? null : grade <= PASS_THRESHOLD,
      attempt: null,
      source: "legacy",
      bonus: null,
    }
  }

  return { grade: null, percent: null, passed: null, attempt: null, source: null, bonus: null }
}

/** ECTS-weighted average over precomputed final grades. */
export function programAverageFromFinals(
  modules: { finalGrade: number | null; ects: number | null }[]
): number | null {
  let weightedSum = 0
  let totalEcts = 0
  for (const m of modules) {
    if (m.finalGrade == null) continue
    const ects = m.ects ?? 0
    if (ects === 0) continue
    weightedSum += m.finalGrade * ects
    totalEcts += ects
  }
  return totalEcts === 0 ? null : weightedSum / totalEcts
}
