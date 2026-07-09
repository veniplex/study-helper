import { describe, expect, it } from "vitest"
import { earnedEcts, moduleGrade, programAverage } from "./grades"

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
