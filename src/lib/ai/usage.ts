import "server-only"
import { and, eq, gte, sum } from "drizzle-orm"
import { db } from "@/db"
import { aiUsageLog } from "@/db/schema"
import { getSetting } from "@/lib/settings"

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

/** Throws if the user exceeded the admin-configured monthly token limit. */
export async function assertWithinLimit(userId: string): Promise<void> {
  const ai = await getSetting("ai")
  const limit = ai?.monthlyTokenLimitPerUser ?? 0
  if (limit === 0) return
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
  const used = (row?.total ?? 0) + (row?.totalOut ?? 0)
  if (used >= limit) {
    throw new Error("Monthly token limit reached")
  }
}
