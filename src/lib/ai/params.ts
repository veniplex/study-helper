import "server-only"

/**
 * Central generation parameters. Every SDK call used to run on raw provider
 * defaults (typically temperature ~0.7–1.0 and an implicit output cap), which
 * is wrong for most of this app's work:
 * - content generation (cards/questions/outlines/summaries/plans) must stay
 *   faithful to the source excerpts → low temperature,
 * - grading must be reproducible — the same answer must not flip between
 *   correct and incorrect on a re-submit → temperature 0,
 * - the live generation path needs an explicit output budget like the batch
 *   path already had, or large requests get silently truncated mid-JSON and
 *   fail schema parsing.
 */

/** Faithful, low-variance content generation grounded in source material. */
export const GEN_PARAMS = { temperature: 0.2 } as const

/** Deterministic evaluation (free-text answer grading). */
export const GRADING_PARAMS = { temperature: 0 } as const

/** Conversational chat — some variance is desirable. */
export const CHAT_PARAMS = { temperature: 0.7 } as const

/** Short utility calls (conversation titles etc.). */
export const UTILITY_PARAMS = { temperature: 0.3 } as const

/**
 * Output-token budget per generated batch of `count` items — mirrors the batch
 * path's budget (generate.ts batchMaxTokens) so live and batch generation
 * behave identically.
 */
export function maxTokensForItems(count: number): number {
  return Math.min(8000, Math.max(1500, count * 400))
}

/**
 * Output-token budget for a single prose generation (an outline, a summary,
 * source suggestions) that isn't a countable list of items. Gives the model
 * enough room to finish long structured prose without truncating mid-answer,
 * while still capping cost. Defaults to a value sized for a multi-section
 * outline; pass a smaller cap for short utility prose.
 */
export function maxTokensForText(cap = 4000): number {
  return Math.min(8000, Math.max(500, cap))
}
