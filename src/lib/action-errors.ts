/**
 * Stable, language-independent codes for user-facing server-action failures.
 *
 * Server actions throw `actionError("CODE")` (an `ERR:<code>` token) instead of
 * a human-readable, single-language string. The client maps the code to a
 * localized message via {@link toastActionError}, so a German error never
 * reaches an English user (and vice versa). Mirrors the `AI_ERROR:<code>`
 * contract already consumed in `src/components/ai/chat.tsx`.
 *
 * Every code here MUST have an `errors.<code>` key in both `messages/de.json`
 * and `messages/en.json` — enforced by `src/lib/action-errors.test.ts`.
 */
export const ACTION_ERROR_CODES = [
  "PLAN_NO_AVAILABILITY",
  "PLAN_INVALID_GOAL",
  "GOAL_MAX_ATTEMPTS",
  "WRITING_NO_GOAL",
  "WRITING_NO_DUE_DATE",
  "THESIS_ACTIVE_EXISTS",
  "THESIS_MAX_ATTEMPTS",
  "AI_NO_MODEL",
  "AI_SETUP_REQUIRED",
  "LIMIT_EXCEEDED",
  "RATE_LIMITED",
  "MATERIAL_NAME_REQUIRED",
  "FOLDER_DUPLICATE",
  "GENERIC",
] as const

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number]

/**
 * Throws an Error whose message is a stable `ERR:<code>` token. The optional
 * `fallbackMessage` is appended for server logs / non-UI callers only — it is
 * never shown to a user (the client resolves the code to a localized string).
 */
export function actionError(code: ActionErrorCode, fallbackMessage?: string): never {
  throw new Error(`ERR:${code}${fallbackMessage ? ` ${fallbackMessage}` : ""}`)
}

/**
 * Extracts a known {@link ActionErrorCode} from a thrown error, or null. The
 * code is the first whitespace-delimited token after the `ERR:` prefix, so an
 * optional trailing fallback message doesn't break parsing.
 */
export function extractActionErrorCode(error: unknown): ActionErrorCode | null {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.startsWith("ERR:")) return null
  // split always yields at least one element; "" simply matches no known code.
  const code = message.slice(4).split(/\s/, 1)[0] ?? ""
  return (ACTION_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ActionErrorCode)
    : null
}
