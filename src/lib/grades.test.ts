import { describe, expect, it } from "vitest"
import {
  DEFAULT_GERMAN_SCALE,
  earnedEcts,
  effectiveBonus,
  moduleFinalGrade,
  moduleGrade,
  percentToGrade,
  programAverage,
  programAverageFromFinals,
  requiredGradeForGoal,
  type BonusAssignment,
} from "./grades"

import type { FinalGradeAttempt, GradeGoalInput } from "./grades"

/** A single non-pass/fail grade goal carrying the given attempts (weight 1). */
const gradeGoal = (attempts: FinalGradeAttempt[], passFail = false): GradeGoalInput => ({
  weight: 1,
  passFail,
  attempts,
})

describe("moduleGrade", () => {
  it("returns null without grades", () => {
    expect(moduleGrade([])).toBeNull()
  })

  it("computes weighted average", () => {
    expect(
      moduleGrade([
        { value: "1.0", weight: "1", attempt: 1 },
        { value: "2.0", weight: "3", attempt: 1 },
      ])
    ).toBeCloseTo(1.75)
  })

  it("uses only the highest attempt", () => {
    expect(
      moduleGrade([
        { value: "5.0", weight: "1", attempt: 1 },
        { value: "2.3", weight: "1", attempt: 2 },
      ])
    ).toBeCloseTo(2.3)
  })
})

describe("programAverage", () => {
  it("weights by ECTS", () => {
    const avg = programAverage([
      { ects: 5, status: "passed", grades: [{ value: "1.0", weight: "1", attempt: 1 }] },
      { ects: 10, status: "passed", grades: [{ value: "2.5", weight: "1", attempt: 1 }] },
    ])
    expect(avg).toBeCloseTo(2.0)
  })

  it("ignores ungraded modules", () => {
    const avg = programAverage([
      { ects: 5, status: "passed", grades: [{ value: "2.0", weight: "1", attempt: 1 }] },
      { ects: 10, status: "planned", grades: [] },
    ])
    expect(avg).toBeCloseTo(2.0)
  })

  it("returns null when nothing is graded", () => {
    expect(programAverage([{ ects: 5, status: "planned", grades: [] }])).toBeNull()
  })
})

describe("earnedEcts", () => {
  it("sums only passed modules", () => {
    expect(
      earnedEcts([
        { ects: 5, status: "passed", grades: [] },
        { ects: 10, status: "active", grades: [] },
        { ects: 7, status: "passed", grades: [] },
      ])
    ).toBe(12)
  })
})

describe("percentToGrade", () => {
  it("maps scale boundaries on the default German scale", () => {
    expect(percentToGrade(null, 95)).toBe(1.0)
    expect(percentToGrade(null, 94.9)).toBe(1.3)
    expect(percentToGrade(null, 50)).toBe(4.0)
    expect(percentToGrade(null, 49.9)).toBe(5.0)
  })

  it("uses a custom scale", () => {
    const scale = [
      { minPercent: 60, grade: 1.0 },
      { minPercent: 30, grade: 4.0 },
    ]
    expect(percentToGrade(scale, 80)).toBe(1.0)
    expect(percentToGrade(scale, 45)).toBe(4.0)
    expect(percentToGrade(scale, 20)).toBe(5.0)
  })

  it("falls back to the default when the scale is empty", () => {
    expect(percentToGrade([], 88)).toBe(1.7)
  })
})

describe("effectiveBonus", () => {
  const graded = (status: BonusAssignment["status"], percent: number | null): BonusAssignment => ({
    kind: "graded",
    status,
    percent,
  })

  it("awards percent points once the condition is met", () => {
    const b = effectiveBonus(
      { type: "percent_points", value: 5, minAvgPercent: 70 },
      [graded("graded", 80), graded("graded", 90)]
    )
    expect(b.conditionMet).toBe(true)
    expect(b.percentPoints).toBe(5)
    expect(b.avgPercent).toBeCloseTo(85)
  })

  it("withholds the bonus when the average is too low", () => {
    const b = effectiveBonus({ type: "percent_points", value: 5, minAvgPercent: 90 }, [
      graded("graded", 80),
    ])
    expect(b.conditionMet).toBe(false)
    expect(b.percentPoints).toBe(0)
  })

  it("treats a null bonus config as no bonus", () => {
    const b = effectiveBonus(null, [graded("graded", 100)])
    expect(b.conditionMet).toBe(false)
    expect(b.percentPoints).toBe(0)
  })

  it("ignores practice assignments in the completed share", () => {
    const b = effectiveBonus({ type: "grade_steps", value: 0.3, minCompletedShare: 1 }, [
      graded("graded", 100),
      { kind: "practice", status: "graded", percent: 10 },
    ])
    expect(b.completedShare).toBe(1)
    expect(b.gradeSteps).toBe(0.3)
  })
})

describe("moduleFinalGrade", () => {
  it("derives the grade from the percentage only — a percent-point bonus does not raise it", () => {
    const r = moduleFinalGrade({
      gradeGoals: [gradeGoal([{ attempt: 1, resultPercent: "78", passed: true }])],
      bonus: { type: "percent_points", value: 5 },
      assignments: [{ kind: "graded", status: "graded", percent: 100 }],
      scale: null,
    })
    // 78 % → 2.3 (≥75); the +5 bonus is reported but not applied to the grade.
    expect(r.percent).toBe(78)
    expect(r.grade).toBe(2.3)
    expect(r.source).toBe("assessment")
    expect(r.bonus?.percentPoints).toBe(5)
  })

  it("does not apply grade steps to the final grade", () => {
    const r = moduleFinalGrade({
      gradeGoals: [gradeGoal([{ attempt: 1, resultPercent: "82", passed: true }])],
      bonus: { type: "grade_steps", value: 0.3 },
      assignments: [{ kind: "graded", status: "graded", percent: 100 }],
      scale: null,
    })
    // 82 % → 2.0; without decoupling the 0.3 step would have yielded 1.7.
    expect(r.grade).toBe(2.0)
    expect(r.bonus?.gradeSteps).toBe(0.3)
  })

  it("yields the same final grade with or without a configured bonus", () => {
    const attempts = [{ attempt: 1, resultPercent: "78", passed: true }]
    const withBonus = moduleFinalGrade({
      gradeGoals: [gradeGoal(attempts)],
      bonus: { type: "percent_points", value: 5 },
      assignments: [{ kind: "graded", status: "graded", percent: 100 }],
      scale: null,
    })
    const withoutBonus = moduleFinalGrade({
      gradeGoals: [gradeGoal(attempts)],
      bonus: null,
      assignments: [],
      scale: null,
    })
    expect(withBonus.grade).toBe(withoutBonus.grade)
  })

  it("uses the latest attempt", () => {
    const r = moduleFinalGrade({
      gradeGoals: [
        gradeGoal([
          { attempt: 1, resultPercent: "40", passed: false },
          { attempt: 2, resultPercent: "72", passed: true },
        ]),
      ],
      assignments: [],
      scale: null,
    })
    expect(r.attempt).toBe(2)
    expect(r.grade).toBe(2.7)
  })

  it("averages multiple grade goals by weight", () => {
    // Goal A: 95 % → 1.0 (weight 1); Goal B: 80 % → 2.0 (weight 3).
    const r = moduleFinalGrade({
      gradeGoals: [
        { weight: 1, passFail: false, attempts: [{ attempt: 1, resultPercent: "95", passed: true }] },
        { weight: 3, passFail: false, attempts: [{ attempt: 1, resultPercent: "80", passed: true }] },
      ],
      assignments: [],
      scale: null,
    })
    // (1.0*1 + 2.0*3) / 4 = 1.75; percent/attempt are null for multi-goal modules.
    expect(r.grade).toBeCloseTo(1.75)
    expect(r.percent).toBeNull()
    expect(r.passed).toBe(true)
  })

  it("fails the module when any grade goal failed", () => {
    const r = moduleFinalGrade({
      gradeGoals: [
        { weight: 1, passFail: false, attempts: [{ attempt: 1, resultPercent: "95", passed: true }] },
        { weight: 1, passFail: true, attempts: [{ attempt: 1, resultPercent: null, passed: false }] },
      ],
      assignments: [],
      scale: null,
    })
    expect(r.passed).toBe(false)
  })

  it("reports only passed for pass/fail goals", () => {
    const r = moduleFinalGrade({
      gradeGoals: [gradeGoal([{ attempt: 1, resultPercent: null, passed: true }], true)],
      assignments: [],
      scale: null,
    })
    expect(r.grade).toBeNull()
    expect(r.passed).toBe(true)
  })

  it("falls back to legacy grades when no goal has an attempt", () => {
    const r = moduleFinalGrade({
      gradeGoals: [gradeGoal([])],
      assignments: [],
      scale: null,
      legacyGrades: [{ value: "2.0", weight: "1", attempt: 1 }],
    })
    expect(r.source).toBe("legacy")
    expect(r.grade).toBeCloseTo(2.0)
  })

  it("returns nulls without attempts or legacy grades", () => {
    const r = moduleFinalGrade({ gradeGoals: [], assignments: [], scale: null })
    expect(r).toMatchObject({ grade: null, source: null })
  })
})

describe("programAverageFromFinals", () => {
  it("weights final grades by ECTS", () => {
    const avg = programAverageFromFinals([
      { finalGrade: 1.0, ects: 5 },
      { finalGrade: 2.5, ects: 10 },
      { finalGrade: null, ects: 5 },
    ])
    expect(avg).toBeCloseTo(2.0)
  })
})

describe("requiredGradeForGoal", () => {
  // 60 ECTS graded at a 2.008 average, 60 ECTS remaining, 120 ECTS total.
  const avg = 2.0083333
  it("rounds the required grade to one decimal (consistent with the display)", () => {
    // Reaching 1.5 needs 0.99 on the remainder → rounds to 1.0 (best achievable
    // final is 1.504, shown as 1,5), so it is 'needed 1.0', not 'unreachable'.
    expect(requiredGradeForGoal(1.5, avg, 60, 120)).toEqual({ kind: "needed", grade: 1.0 })
    // Reaching 1.6 needs 1.19 → rounds to 1.2.
    expect(requiredGradeForGoal(1.6, avg, 60, 120)).toEqual({ kind: "needed", grade: 1.2 })
  })

  it("flags a target as unreachable when it needs better than 1.0", () => {
    // target 1.3 with a 2.5 average → needs 0.1 on the remainder.
    expect(requiredGradeForGoal(1.3, 2.5, 60, 120)).toEqual({ kind: "unreachable" })
  })

  it("flags a target as safe when even a 4.0 keeps it", () => {
    expect(requiredGradeForGoal(3.0, 2.0, 60, 120)).toEqual({ kind: "safe" })
  })

  it("returns null when no ECTS remain", () => {
    expect(requiredGradeForGoal(2.0, 2.0, 120, 120)).toBeNull()
  })
})

describe("DEFAULT_GERMAN_SCALE", () => {
  it("is sorted descending and spans 50-95", () => {
    expect(DEFAULT_GERMAN_SCALE[0]).toEqual({ minPercent: 95, grade: 1.0 })
    expect(DEFAULT_GERMAN_SCALE.at(-1)).toEqual({ minPercent: 50, grade: 4.0 })
  })
})
