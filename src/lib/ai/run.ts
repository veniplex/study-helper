import "server-only"
import { logAudit } from "@/lib/audit"
import type { AuditOperation } from "@/db/schema"
import { logUsage } from "./usage"

export type AiUsage = { inputTokens: number; outputTokens: number; totalTokens: number }

/** Audit operations that describe an AI action (as opposed to user CRUD). */
export type AiAuditOperation = Extract<AuditOperation, `ai_${string}`>

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * Normalizes the different usage shapes the AI SDK returns: language models use
 * `inputTokens`/`outputTokens`/`totalTokens`; embeddings use `tokens`; some
 * providers still return `promptTokens`/`completionTokens`.
 */
export function normalizeUsage(usage: unknown): AiUsage {
  const src = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : {}
  const inputTokens = pickNumber(src, ["inputTokens", "promptTokens", "tokens"]) ?? 0
  const outputTokens = pickNumber(src, ["outputTokens", "completionTokens"]) ?? 0
  const totalTokens = pickNumber(src, ["totalTokens"]) ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

export type AiCallContext = {
  userId: string
  /** "providerId:modelId" used for the request */
  model: string
  /** short feature key for the usage ledger, e.g. "flashcards", "quiz", "outline", "embedding" */
  feature: string
  /** audit operation; defaults to "ai_generate" */
  operation?: AiAuditOperation
  moduleId?: string | null
  jobId?: string | null
  /** audit entityType (default "ai") and entityId/label for the audit row */
  entityType?: string
  entityId?: string
  entityLabel?: string
  conversationId?: string | null
  /** number of items produced (cards, questions, chunks) — shown in the audit entry */
  itemCount?: number
  /**
   * Set false to skip the human-readable audit entry (the token ledger is still
   * written). Use for hot loops (e.g. per-batch embedding) that write one
   * aggregated audit entry afterwards, to keep the audit log readable.
   */
  audit?: boolean
}

/** The shape stored in the audit log's `after` field for AI events. */
export type AiAuditMeta = {
  kind: "ai_usage"
  feature: string
  model: string
  moduleId: string | null
  jobId: string | null
  itemCount: number | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Writes the token-ledger entry (aiUsageLog) for an AI call. Always called. */
export async function recordAiUsage(ctx: AiCallContext, usage: AiUsage): Promise<void> {
  await logUsage(ctx.userId, ctx.model, ctx.feature, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })
}

/**
 * Writes a human-readable audit entry for an AI call, including the token counts
 * (stored in `after` so the audit UI can display them). Never throws.
 */
export async function recordAiAudit(ctx: AiCallContext, usage: AiUsage): Promise<void> {
  const meta: AiAuditMeta = {
    kind: "ai_usage",
    feature: ctx.feature,
    model: ctx.model,
    moduleId: ctx.moduleId ?? null,
    jobId: ctx.jobId ?? null,
    itemCount: ctx.itemCount ?? null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
  await logAudit({
    userId: ctx.userId,
    actor: "ai",
    operation: ctx.operation ?? "ai_generate",
    entityType: ctx.entityType ?? "ai",
    entityId: ctx.entityId ?? ctx.jobId ?? ctx.moduleId ?? ctx.feature,
    entityLabel: ctx.entityLabel ?? ctx.feature,
    after: meta,
    conversationId: ctx.conversationId ?? null,
  })
}

/**
 * Wraps any AI SDK call so every invocation is (a) counted in the token ledger
 * (aiUsageLog) and (b) recorded in the audit log with model, feature and token
 * counts. This is the single choke point every AI request must go through, so
 * usage/audit logging can never be forgotten at a call site.
 *
 * The wrapped function must return an object exposing `usage`
 * (generateObject/generateText/embed/embedMany results all do). Logging is
 * best-effort and never breaks the wrapped call.
 */
export async function runAi<T>(
  ctx: AiCallContext,
  fn: () => Promise<T>
): Promise<T & { aiUsage: AiUsage }> {
  const result = await fn()
  const usage = normalizeUsage((result as { usage?: unknown } | null)?.usage)
  try {
    await recordAiUsage(ctx, usage)
    if (ctx.audit !== false) await recordAiAudit(ctx, usage)
  } catch (error) {
    console.error("[runAi] usage/audit logging failed", error)
  }
  return Object.assign(result as object, { aiUsage: usage }) as T & { aiUsage: AiUsage }
}
