import type { GoalGradingRole, GoalType } from "@/db/schema/studies"

/** True if the module has at least one goal of the given type. */
export function hasGoal<T extends { type: GoalType }>(goals: T[], type: GoalType): boolean {
  return goals.some((g) => g.type === type)
}

/** The goal that carries a module's grade (first `grade`-role goal, else first). */
export function primaryGradeGoal<T extends { gradingRole: GoalGradingRole }>(
  goals: T[]
): T | null {
  return goals.find((g) => g.gradingRole === "grade") ?? goals[0] ?? null
}

/** The module's bonus goal, if any (bonus config lives in its `config.bonus`). */
export function bonusGoal<T extends { gradingRole: GoalGradingRole }>(goals: T[]): T | null {
  return goals.find((g) => g.gradingRole === "bonus") ?? null
}
