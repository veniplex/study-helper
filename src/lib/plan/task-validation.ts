import { z } from "zod"

/**
 * Upper bound for a plan-task due date: today + 3 years (ISO YYYY-MM-DD).
 * Prevents a client from storing e.g. "9999-12-31", which would otherwise blow
 * up the scheduling horizon (see B1). Computed per-call so it tracks "today".
 */
export function maxDueIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 365 * 86400000).toISOString().slice(0, 10)
}

/** A zod `YYYY-MM-DD` date string, refined to be no more than 3 years out. */
export const dueDateField = z
  .string()
  .date()
  .refine((d) => d <= maxDueIso(), { message: "dueDate too far in the future" })
