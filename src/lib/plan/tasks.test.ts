import { describe, expect, it } from "vitest"
import { buildTaskDrafts, reviewDays, sourceKey, type TaskGenInput } from "./tasks"
import type { GoalConfig } from "@/db/schema/studies"

/** Anchor "today" far ahead of the exams so the runway math is deterministic. */
const TODAY = "2026-01-01"

function base(over: Partial<TaskGenInput> = {}): TaskGenInput {
  return { goals: [], outlineTopics: [], assignments: [], milestones: [], ...over }
}
const cfg = (c: Partial<GoalConfig> = {}): GoalConfig => c

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

describe("reviewDays", () => {
  it("uses an explicit value, clamped to [3,14]", () => {
    expect(reviewDays("2026-09-01", TODAY, 7)).toBe(7)
    expect(reviewDays("2026-09-01", TODAY, 1)).toBe(3) // floored
    expect(reviewDays("2026-09-01", TODAY, 30)).toBe(14) // capped
  })

  it("derives 25% of the runway, clamped to [3,14]", () => {
    // ~243 days out → 0.25×243 ≈ 61 → capped at 14
    expect(reviewDays("2026-09-01", TODAY)).toBe(14)
    // 40 days out → 0.25×40 = 10
    expect(reviewDays("2026-02-10", TODAY)).toBe(10)
    // 4 days out → 0.25×4 = 1 → floored to 3
    expect(reviewDays("2026-01-05", TODAY)).toBe(3)
    // in the past / today → floored to 3
    expect(reviewDays("2026-01-01", TODAY)).toBe(3)
  })
})

describe("buildTaskDrafts — exam consolidation window", () => {
  it("learning tasks are due BEFORE the window (exam − reviewDays)", () => {
    const exam = "2026-09-01"
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g1", type: "exam", title: "Klausur", dueDate: exam, config: cfg() }],
        outlineTopics: [
          { id: "top1", title: "Vektoren", weight: 8 },
          { id: "top2", title: "Matrizen", weight: 4 },
        ],
      }),
      TODAY
    )
    const rd = reviewDays(exam, TODAY) // 14
    const windowStart = new Date(Date.parse(`${exam}T00:00:00Z`) - rd * 86400000)
      .toISOString()
      .slice(0, 10)

    const topicTasks = drafts.filter((d) => d.source.kind === "outline_topic")
    expect(topicTasks).toHaveLength(2)
    expect(topicTasks[0]!.source.refId).toBe("top1")
    expect(topicTasks[0]!.category).toBe("learn")
    expect(topicTasks.every((t) => t.dueDate === windowStart)).toBe(true)
    expect(topicTasks[0]!.estimatedMinutes).toBeGreaterThan(topicTasks[1]!.estimatedMinutes)
  })

  it("emits a spaced review series (+cards) sized by reviewDays, plus one mock", () => {
    const exam = "2026-09-01"
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g1", type: "exam", title: null, dueDate: exam, config: cfg() }],
        outlineTopics: [{ id: "t", title: "A", weight: 5 }],
      }),
      TODAY
    )
    const rd = reviewDays(exam, TODAY) // 14
    const n = Math.max(2, Math.min(5, Math.ceil(rd / 3))) // 5

    const reviews = drafts.filter((d) => (d.source.refId ?? "").startsWith("review-"))
    const cards = drafts.filter((d) => (d.source.refId ?? "").startsWith("cards-"))
    const mocks = drafts.filter((d) => (d.source.refId ?? "").startsWith("mock-"))

    expect(reviews).toHaveLength(n)
    expect(cards).toHaveLength(n)
    expect(mocks).toHaveLength(1)
    expect(reviews.every((r) => r.category === "review")).toBe(true)
    expect(cards.every((c) => c.category === "cards")).toBe(true)
    expect(mocks[0]!.category).toBe("review")

    // Every review/cards task lands inside [exam−rd, exam]; mock the day before.
    const start = new Date(Date.parse(`${exam}T00:00:00Z`) - rd * 86400000).toISOString().slice(0, 10)
    for (const d of [...reviews, ...cards]) {
      expect(d.dueDate! >= start && d.dueDate! <= exam).toBe(true)
    }
    expect(daysBetween(mocks[0]!.dueDate!, exam)).toBe(1)
  })

  it("series count is clamped to [2,5]", () => {
    // 5 days out → rd=3 → ceil(1)=1 → clamped to 2 reviews
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g", type: "exam", title: null, dueDate: "2026-01-06", config: cfg() }],
        outlineTopics: [{ id: "t", title: "A", weight: 5 }],
      }),
      TODAY
    )
    expect(drafts.filter((d) => (d.source.refId ?? "").startsWith("review-"))).toHaveLength(2)
  })

  it("no outline → single grounding task due before the window", () => {
    const exam = "2026-09-01"
    const drafts = buildTaskDrafts(
      base({ goals: [{ id: "g1", type: "exam", title: null, dueDate: exam, config: cfg() }] }),
      TODAY
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.source.refId).toBe("study-g1")
    expect(drafts[0]!.category).toBe("learn")
    const rd = reviewDays(exam, TODAY)
    expect(daysBetween(drafts[0]!.dueDate!, exam)).toBe(rd)
  })
})

describe("buildTaskDrafts — other goal types", () => {
  it("assignments goal → one task per open assignment with its due date", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [{ id: "g2", type: "assignments", title: null, dueDate: null, config: cfg() }],
        assignments: [
          { id: "a1", title: "Blatt 1", dueDate: "2026-08-10" },
          { id: "a2", title: "Blatt 2", dueDate: "2026-08-17" },
        ],
      }),
      TODAY
    )
    expect(drafts).toHaveLength(2)
    expect(drafts.map((d) => d.source.refId)).toEqual(["a1", "a2"])
    expect(drafts[0]!.dueDate).toBe("2026-08-10")
    expect(drafts[0]!.goalId).toBe("g2")
    expect(drafts.every((d) => d.category === "learn")).toBe(true)
  })

  it("assignments goal without sheets → expectedCount placeholders", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [
          { id: "g2", type: "assignments", title: null, dueDate: null, config: cfg({ expectedCount: 3 }) },
        ],
      }),
      TODAY
    )
    expect(drafts).toHaveLength(3)
    expect(drafts.every((d) => d.source.kind === "ai")).toBe(true)
  })

  it("term_paper goal → task per milestone, else default phase tasks", () => {
    const withMilestones = buildTaskDrafts(
      base({
        goals: [{ id: "g3", type: "term_paper", title: null, dueDate: "2026-09-30", config: cfg() }],
        milestones: [{ id: "m1", title: "Exposé", description: "x", dueDate: "2026-08-20" }],
      }),
      TODAY
    )
    expect(withMilestones).toHaveLength(1)
    expect(withMilestones[0]!.source).toEqual({ kind: "milestone", refId: "m1" })

    const noMilestones = buildTaskDrafts(
      base({
        goals: [
          { id: "g3", type: "term_paper", title: null, dueDate: "2026-09-30", config: cfg({ variant: "task" }) },
        ],
      }),
      TODAY
    )
    expect(noMilestones.length).toBeGreaterThan(0)
    expect(noMilestones.every((d) => d.source.kind === "ai")).toBe(true)
    expect(noMilestones[noMilestones.length - 1]!.dueDate).toBe("2026-09-30")
  })

  it("presentation goal → prep + rehearsal tasks", () => {
    const drafts = buildTaskDrafts(
      base({
        goals: [
          { id: "g4", type: "presentation", title: null, dueDate: "2026-08-15", config: cfg({ durationMinutes: 20 }) },
        ],
      }),
      TODAY
    )
    expect(drafts.map((d) => d.source.refId)).toEqual(["prep-g4", "rehearse-g4"])
    expect(drafts.every((d) => d.dueDate === "2026-08-15")).toBe(true)
  })

  it("other goal type yields no tasks", () => {
    const drafts = buildTaskDrafts(
      base({ goals: [{ id: "g5", type: "other", title: null, dueDate: null, config: cfg() }] }),
      TODAY
    )
    expect(drafts).toHaveLength(0)
  })
})

describe("buildTaskDrafts — idempotent source keys", () => {
  it("produces stable, unique source keys across runs", () => {
    const input = base({
      goals: [{ id: "g1", type: "exam", title: null, dueDate: "2026-09-01", config: cfg() }],
      outlineTopics: [{ id: "top1", title: "A", weight: 5 }],
    })
    const first = buildTaskDrafts(input, TODAY).map((d) => sourceKey(d.source))
    const second = buildTaskDrafts(input, TODAY).map((d) => sourceKey(d.source))
    expect(second).toEqual(first)
    expect(new Set(first).size).toBe(first.length) // all unique
  })
})
