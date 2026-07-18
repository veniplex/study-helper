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

/** The bonus a module's bonus-goal grants, read from its `config.bonus`. */
export type BonusConfig = {
  type: BonusType
  value?: number | null
  minAvgPercent?: number | null
  minCompletedShare?: number | null
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
  bonus: BonusConfig | null | undefined,
  assignments: BonusAssignment[]
): BonusResult {
  const graded = assignments.filter((a) => a.kind === "graded")
  const completed = graded.filter((a) => a.status === "graded" && a.percent != null)
  const avgPercent = completed.length
    ? completed.reduce((s, a) => s + (a.percent ?? 0), 0) / completed.length
    : 0
  const completedShare = graded.length ? completed.length / graded.length : 0

  const type = bonus?.type ?? "none"
  const minAvg = bonus?.minAvgPercent ?? null
  const minShare = bonus?.minCompletedShare ?? null
  const value = bonus?.value ?? 0
  const conditionMet =
    type !== "none" &&
    (minAvg == null || avgPercent >= minAvg) &&
    (minShare == null || completedShare >= minShare)

  return {
    percentPoints: conditionMet && type === "percent_points" ? value : 0,
    gradeSteps: conditionMet && type === "grade_steps" ? value : 0,
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

/** One `grade`-role goal of a module: its weight, pass/fail flag and attempts. */
export type GradeGoalInput = {
  weight: number
  passFail: boolean
  attempts: FinalGradeAttempt[]
}

export type FinalGradeInput = {
  /** The module's `grade`-role goals (weighted average). */
  gradeGoals: GradeGoalInput[]
  /** The bonus goal's config, if any (reported, never shifts the grade). */
  bonus?: BonusConfig | null
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

type GoalResult = {
  grade: number | null
  percent: number | null
  passed: boolean | null
  attempt: number | null
  weight: number
}

/** One grade goal's result from its latest attempt (same math as a single
 * assessment historically: latest attempt → percent → grade scale). */
function gradeGoalResult(goal: GradeGoalInput, scale: GradeScaleRow[] | null): GoalResult | null {
  if (goal.attempts.length === 0) return null
  const latest = goal.attempts.reduce((a, b) => (b.attempt >= a.attempt ? b : a))
  const percent = num(latest.resultPercent)

  if (goal.passFail) {
    return { grade: null, percent, passed: latest.passed, attempt: latest.attempt, weight: goal.weight }
  }
  if (percent != null) {
    const grade = percentToGrade(scale, percent)
    return { grade, percent, passed: grade <= PASS_THRESHOLD, attempt: latest.attempt, weight: goal.weight }
  }
  // Attempt exists but no percentage recorded yet.
  return { grade: null, percent: null, passed: latest.passed, attempt: latest.attempt, weight: goal.weight }
}

/** Combines the per-goal passed flags: all-passed → true, any-failed → false. */
function aggregatePassed(results: GoalResult[]): boolean | null {
  if (results.length === 0) return null
  if (results.some((r) => r.passed === false)) return false
  if (results.every((r) => r.passed === true)) return true
  return null
}

/**
 * Computes a module's final grade as the weighted average over its `grade`-role
 * goals (each goal's result from its latest attempt's percentage → grade
 * scale), falling back to legacy free-form grades when no goal has an attempt.
 * The assignment bonus is computed and returned for display but never shifts
 * the grade. A module with a single grade goal behaves exactly as a single
 * assessment did historically. Pass/fail goals yield only a passed flag.
 */
export function moduleFinalGrade(input: FinalGradeInput): FinalGrade {
  const { gradeGoals, bonus, assignments, scale, legacyGrades } = input

  const results = gradeGoals
    .map((g) => gradeGoalResult(g, scale))
    .filter((r): r is GoalResult => r !== null)

  if (results.length > 0) {
    const bonusResult = effectiveBonus(bonus, assignments)

    const numeric = results.filter((r) => r.grade != null)
    const totalWeight = numeric.reduce((s, r) => s + r.weight, 0)
    const grade =
      numeric.length > 0 && totalWeight > 0
        ? numeric.reduce((s, r) => s + (r.grade as number) * r.weight, 0) / totalWeight
        : null

    // percent/attempt are only meaningful for a single-goal module; multi-goal
    // modules report them as null (the per-goal detail lives on the goals).
    const single = results.length === 1 ? results[0] : null

    return {
      grade,
      percent: single ? single.percent : null,
      passed: aggregatePassed(results),
      attempt: single ? single.attempt : null,
      source: "assessment",
      bonus: bonusResult,
    }
  }

  // Legacy fallback: pre-goal free-form grade rows.
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

export type GradeGoalResult =
  | { kind: "needed"; grade: number }
  | { kind: "safe" }
  | { kind: "unreachable" }
  | null

/**
 * "What do I need?" simulator: the ECTS-weighted average grade required on the
 * remaining (ungraded) modules to reach `target` as the final program grade.
 *
 * The required grade is rounded to one decimal to match how grades are shown
 * everywhere else — otherwise a target whose best achievable final rounds to it
 * (e.g. a best case of 1.504, displayed as "1.5") is wrongly flagged as
 * unreachable. Returns null when there are no remaining ECTS or inputs are
 * unusable. `safe` = even the worst pass (4.0) keeps the target; `unreachable`
 * = would need better than the best grade (1.0).
 */
export function requiredGradeForGoal(
  target: number,
  average: number | null,
  gradedEcts: number,
  targetEcts: number
): GradeGoalResult {
  const remainingEcts = targetEcts - gradedEcts
  if (!(remainingEcts > 0)) return null
  const raw = (target * targetEcts - (average ?? 0) * gradedEcts) / remainingEcts
  if (!Number.isFinite(raw)) return null
  const required = Math.round(raw * 10) / 10
  if (required < BEST_GRADE) return { kind: "unreachable" }
  if (required >= PASS_THRESHOLD) return { kind: "safe" }
  return { kind: "needed", grade: required }
}
