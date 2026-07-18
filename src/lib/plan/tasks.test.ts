import { describe, expect, it } from "vitest"
import { buildTaskDrafts, sourceKey, type TaskGenInput } from "./tasks"
import type { GoalConfig } from "@/db/schema/studies"

function base(over: Partial<TaskGenInput> = {}): TaskGenInput {
  return { goals: [], outlineTopics: [], assignments: [], milestones: [], ...over }
}
const cfg = (c: Partial<GoalConfig> = {}): GoalConfig => c

describe("buildTaskDrafts", () => {
  it("exam goal → one learning task per outline topic + review tasks", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g1", type: "exam", title: "Klausur", dueDate: "2026-09-01", config: cfg() }],
        outlineTopics: [
          { id: "top1", title: "Vektoren", weight: 8 },
          { id: "top2", title: "Matrizen", weight: 4 },
        ],
      })
    )
    const topicTasks = drafts.filter((d) => d.source.kind === "outline_topic")
    expect(topicTasks).toHaveLength(2)
    expect(topicTasks[0].source.refId).toBe("top1")
    expect(topicTasks[0].dueDate).toBe("2026-09-01")
    // heavier topic gets more minutes
    expect(topicTasks[0].estimatedMinutes).toBeGreaterThan(topicTasks[1].estimatedMinutes)
    // review tasks present
    expect(drafts.some((d) => d.source.refId === "review-g1")).toBe(true)
    expect(drafts.some((d) => d.source.refId === "mock-g1")).toBe(true)
  })

  it("exam goal without outline → single grounding task", () => {
    const drafts = buildTaskDrafts(
      base({ goals: [{ id: "g1", type: "exam", title: null, dueDate: null, config: cfg() }] })
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0].source.refId).toBe("study-g1")
  })

  it("assignments goal → one task per open assignment with its due date", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g2", type: "assignments", title: null, dueDate: null, config: cfg() }],
        assignments: [
          { id: "a1", title: "Blatt 1", dueDate: "2026-08-10" },
          { id: "a2", title: "Blatt 2", dueDate: "2026-08-17" },
        ],
      })
    )
    expect(drafts).toHaveLength(2)
    expect(drafts.map((d) => d.source.refId)).toEqual(["a1", "a2"])
    expect(drafts[0].dueDate).toBe("2026-08-10")
    expect(drafts[0].goalId).toBe("g2")
  })

  it("assignments goal without sheets → expectedCount placeholders", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [
          { id: "g2", type: "assignments", title: null, dueDate: null, config: cfg({ expectedCount: 3 }) },
        ],
      })
    )
    expect(drafts).toHaveLength(3)
    expect(drafts.every((d) => d.source.kind === "ai")).toBe(true)
  })

  it("term_paper goal → task per milestone, else default phase tasks", () => {
    const withMilestones = buildTaskDrafts(
      base({
        goals: [{ id: "g3", type: "term_paper", title: null, dueDate: "2026-09-30", config: cfg() }],
        milestones: [{ id: "m1", title: "Exposé", description: "x", dueDate: "2026-08-20" }],
      })
    )
    expect(withMilestones).toHaveLength(1)
    expect(withMilestones[0].source).toEqual({ kind: "milestone", refId: "m1" })

    const noMilestones = buildTaskDrafts(
      base({
        goals: [
          { id: "g3", type: "term_paper", title: null, dueDate: "2026-09-30", config: cfg({ variant: "task" }) },
        ],
      })
    )
    expect(noMilestones.length).toBeGreaterThan(0)
    expect(noMilestones.every((d) => d.source.kind === "ai")).toBe(true)
    // last phase task carries the goal due date
    expect(noMilestones[noMilestones.length - 1].dueDate).toBe("2026-09-30")
  })

  it("presentation goal → prep + rehearsal tasks", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [
          { id: "g4", type: "presentation", title: null, dueDate: "2026-08-15", config: cfg({ durationMinutes: 20 }) },
        ],
      })
    )
    expect(drafts.map((d) => d.source.refId)).toEqual(["prep-g4", "rehearse-g4"])
    expect(drafts.every((d) => d.dueDate === "2026-08-15")).toBe(true)
  })

  it("produces stable, unique source keys for idempotent upserts", () => {
    const input = base({
      goals: [{ id: "g1", type: "exam", title: null, dueDate: null, config: cfg() }],
      outlineTopics: [{ id: "top1", title: "A", weight: 5 }],
    })
    const first = buildTaskDrafts(input).map((d) => sourceKey(d.source))
    const second = buildTaskDrafts(input).map((d) => sourceKey(d.source))
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length) // all unique
  })

  it("other goal type yields no tasks", () => {
    const drafts = buildTaskDrafts(
      base({ goals: [{ id: "g5", type: "other", title: null, dueDate: null, config: cfg() }] })
    )
    expect(drafts).toHaveLength(0)
  })
})
