import type { GradingSystem, ModuleStatus } from "@/db/schema/studies"

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
      return value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
    case "points":
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    case "passfail":
      return value <= 0 ? "✓" : "✗"
  }
}
