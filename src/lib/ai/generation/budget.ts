import "server-only"

/**
 * Rough token estimate for pre-flight budgeting. Uses the ~4-chars-per-token
 * heuristic; good enough to size a run before committing to it (provider token
 * counts vary, and this avoids a network round-trip per estimate).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Estimated tokens for a batch of texts. */
export function estimateTokensBatch(texts: string[]): number {
  return texts.reduce((sum, t) => sum + estimateTokens(t), 0)
}
