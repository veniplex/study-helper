/**
 * Replan selection (pure, DB-free, testable).
 *
 * Decides which open tasks should be fed back into the scheduler on a recompute.
 * A task is kept OUT of the replan only when it sits on a FUTURE session the
 * student has effectively frozen (pinned or already done) — moving it would
 * fight the student's own choices. Everything else is replannable:
 *   - tasks with no session yet,
 *   - tasks on future sessions that are neither pinned nor done,
 *   - tasks on PAST sessions that were never done (catch-up: they were missed
 *     and must be rescheduled forward).
 */

export type ReplanTask = { id: string; sessionId: string | null }

export type ReplanSession = {
  id: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  pinned: boolean
  done: boolean
}

/**
 * Returns the ids of the tasks that should be re-planned.
 *
 * @param tasks open tasks (done=false) with their current sessionId
 * @param keptSessions the sessions being preserved (typically today-forward)
 * @param today ISO date used to classify future vs. past sessions
 */
export function collectReplannableTasks(
  tasks: ReplanTask[],
  keptSessions: ReplanSession[],
  today: string
): string[] {
  // Sessions that are frozen and in the future → their tasks are left alone.
  const frozenFuture = new Set(
    keptSessions.filter((s) => s.date >= today && (s.pinned || s.done)).map((s) => s.id)
  )
  return tasks
    .filter((t) => t.sessionId == null || !frozenFuture.has(t.sessionId))
    .map((t) => t.id)
}
