import { describe, expect, it } from "vitest"
import { collectReplannableTasks, type ReplanSession, type ReplanTask } from "./replan"

const TODAY = "2026-08-10"

describe("collectReplannableTasks", () => {
  it("excludes tasks on FUTURE pinned or done sessions", () => {
    const sessions: ReplanSession[] = [
      { id: "s-pinned", date: "2026-08-15", pinned: true, done: false },
      { id: "s-done", date: "2026-08-16", pinned: false, done: true },
      { id: "s-open", date: "2026-08-17", pinned: false, done: false },
    ]
    const tasks: ReplanTask[] = [
      { id: "t-pinned", sessionId: "s-pinned" },
      { id: "t-done", sessionId: "s-done" },
      { id: "t-open", sessionId: "s-open" },
      { id: "t-free", sessionId: null },
    ]
    const ids = collectReplannableTasks(tasks, sessions, TODAY)
    expect(ids).toContain("t-open")
    expect(ids).toContain("t-free")
    expect(ids).not.toContain("t-pinned")
    expect(ids).not.toContain("t-done")
  })

  it("INCLUDES tasks on PAST sessions even if pinned/done (catch-up)", () => {
    const sessions: ReplanSession[] = [
      { id: "past-done", date: "2026-08-05", pinned: false, done: true },
      { id: "past-pinned", date: "2026-08-06", pinned: true, done: false },
      { id: "past-undone", date: "2026-08-07", pinned: false, done: false },
    ]
    const tasks: ReplanTask[] = [
      { id: "t1", sessionId: "past-done" },
      { id: "t2", sessionId: "past-pinned" },
      { id: "t3", sessionId: "past-undone" },
    ]
    const ids = collectReplannableTasks(tasks, sessions, TODAY)
    expect(ids.sort()).toEqual(["t1", "t2", "t3"])
  })

  it("treats a session dated exactly today as future", () => {
    const sessions: ReplanSession[] = [{ id: "s", date: TODAY, pinned: true, done: false }]
    const tasks: ReplanTask[] = [{ id: "t", sessionId: "s" }]
    expect(collectReplannableTasks(tasks, sessions, TODAY)).toEqual([])
  })

  it("includes tasks whose session is not among the kept sessions", () => {
    const tasks: ReplanTask[] = [{ id: "t", sessionId: "ghost" }]
    expect(collectReplannableTasks(tasks, [], TODAY)).toEqual(["t"])
  })
})
