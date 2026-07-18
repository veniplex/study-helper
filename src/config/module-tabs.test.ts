import { describe, expect, it } from "vitest"
import {
  MODULE_TABS,
  defaultToolsForGoals,
  enabledTools,
  optionalToolKeys,
  visibleModuleTabs,
} from "./module-tabs"

describe("defaultToolsForGoals", () => {
  it("maps exam and oral_exam to decks + quizzes", () => {
    expect(defaultToolsForGoals(["exam"]).sort()).toEqual(["decks", "quizzes"])
    expect(defaultToolsForGoals(["oral_exam"]).sort()).toEqual(["decks", "quizzes"])
  })

  it("maps assignments to assignments", () => {
    expect(defaultToolsForGoals(["assignments"])).toEqual(["assignments"])
  })

  it("maps term_paper, thesis and project to paper", () => {
    expect(defaultToolsForGoals(["term_paper"])).toEqual(["paper"])
    expect(defaultToolsForGoals(["thesis"])).toEqual(["paper"])
    expect(defaultToolsForGoals(["project"])).toEqual(["paper"])
  })

  it("maps presentation to decks", () => {
    expect(defaultToolsForGoals(["presentation"])).toEqual(["decks"])
  })

  it("returns nothing for goal types without optional tools", () => {
    expect(defaultToolsForGoals(["other"])).toEqual([])
  })

  it("de-dupes across multiple goals", () => {
    expect(defaultToolsForGoals(["exam", "presentation"]).sort()).toEqual(["decks", "quizzes"])
    expect(defaultToolsForGoals(["exam", "assignments"]).sort()).toEqual([
      "assignments",
      "decks",
      "quizzes",
    ])
  })

  it("never returns always-on tools", () => {
    const alwaysOn = ["overview", "materials", "plan", "chat"]
    const all = defaultToolsForGoals(["exam", "assignments", "thesis", "presentation", "project"])
    expect(all.some((k) => alwaysOn.includes(k))).toBe(false)
  })
})

describe("enabledTools (matrix ⊕ overrides)", () => {
  it("returns the matrix defaults with no overrides", () => {
    expect(enabledTools(["exam"]).sort()).toEqual(["decks", "quizzes"])
  })

  it("adds an optional tool when overridden true", () => {
    expect(enabledTools(["exam"], { paper: true }).sort()).toEqual(["decks", "paper", "quizzes"])
  })

  it("removes an optional tool when overridden false", () => {
    expect(enabledTools(["exam"], { quizzes: false })).toEqual(["decks"])
  })

  it("combines add and remove overrides", () => {
    expect(enabledTools(["exam"], { quizzes: false, assignments: true }).sort()).toEqual([
      "assignments",
      "decks",
    ])
  })

  it("only recognizes optional keys as overridable", () => {
    // optionalToolKeys are the only keys the merge acts on.
    expect(optionalToolKeys).toEqual(["assignments", "decks", "quizzes", "paper"])
  })
})

describe("visibleModuleTabs", () => {
  it("always shows overview, materials and plan", () => {
    const keys = visibleModuleTabs({ aiAvailable: false, enabledTools: [] }).map((t) => t.key)
    expect(keys).toContain("overview")
    expect(keys).toContain("materials")
    expect(keys).toContain("plan")
  })

  it("gates chat on AI availability", () => {
    const withoutAi = visibleModuleTabs({ aiAvailable: false, enabledTools: [] }).map((t) => t.key)
    expect(withoutAi).not.toContain("chat")
    const withAi = visibleModuleTabs({ aiAvailable: true, enabledTools: [] }).map((t) => t.key)
    expect(withAi).toContain("chat")
  })

  it("shows optional tools only when enabled", () => {
    const keys = visibleModuleTabs({
      aiAvailable: true,
      enabledTools: ["decks", "quizzes"],
    }).map((t) => t.key)
    expect(keys).toContain("decks")
    expect(keys).toContain("quizzes")
    expect(keys).not.toContain("assignments")
    expect(keys).not.toContain("paper")
  })

  it("preserves MODULE_TABS ordering", () => {
    const keys = visibleModuleTabs({
      aiAvailable: true,
      enabledTools: ["assignments", "decks", "quizzes", "paper"],
    }).map((t) => t.key)
    expect(keys).toEqual(MODULE_TABS.map((t) => t.key))
  })
})
