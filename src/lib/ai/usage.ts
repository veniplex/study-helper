import "server-only"
import { and, eq, gte, sum } from "drizzle-orm"
import { db } from "@/db"
import { aiUsageLog } from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { actionError } from "@/lib/action-errors"

export async function logUsage(
  userId: string,
  model: string,
  feature: string,
  usage: { inputTokens?: number; outputTokens?: number }
) {
  await db.insert(aiUsageLog).values({
    userId,
    model,
    feature,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  })
}

/**
 * Returns the user's month-to-date token usage and the configured cap. `limit`
 * is 0 when no cap is set (unlimited). Shared by the throwing and non-throwing
 * limit checks below.
 */
async function monthlyUsage(userId: string): Promise<{ used: number; limit: number }> {
  const ai = await getSetting("ai")
  const limit = ai?.monthlyTokenLimitPerUser ?? 0
  if (limit === 0) return { used: 0, limit: 0 }
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const [row] = await db
    .select({
      total: sum(aiUsageLog.inputTokens).mapWith(Number),
      totalOut: sum(aiUsageLog.outputTokens).mapWith(Number),
    })
    .from(aiUsageLog)
    .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, monthStart)))
  return { used: (row?.total ?? 0) + (row?.totalOut ?? 0), limit }
}

/**
 * Throws if the user exceeded the admin-configured monthly token limit.
 *
 * This is a soft limit by design: usage is recorded after a call finishes, so
 * concurrent in-flight requests can collectively overshoot the cap by roughly
 * one request each. The per-request bounds (message-size and history caps in
 * the chat route) keep that overshoot small; a hard limit would need
 * pessimistic reservations, which isn't worth the complexity here.
 */
export async function assertWithinLimit(userId: string): Promise<void> {
  const { used, limit } = await monthlyUsage(userId)
  if (limit > 0 && used >= limit) {
    actionError("LIMIT_EXCEEDED")
  }
}

/**
 * Non-throwing variant of {@link assertWithinLimit} for background / best-effort
 * AI paths (embedding, OCR/transcription, query embedding, rerank, chat-title
 * generation) that must gate or degrade rather than surface an error. Returns
 * `true` when the user is at/over their monthly cap.
 */
export async function isOverLimit(userId: string): Promise<boolean> {
  const { used, limit } = await monthlyUsage(userId)
  return limit > 0 && used >= limit
}
