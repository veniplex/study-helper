import "server-only"
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { generationJob, outlineTopic } from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { recordAiUsage, type AiCallContext } from "@/lib/ai/run"
import {
  fetchBatchResults,
  pollBatch,
  resolveBatchProvider,
  type BatchResult,
} from "./batch-adapter"
import { Deduper, embedTexts } from "./dedup"
import {
  cardSchema,
  loadExistingKeys,
  persistCards,
  persistQuestions,
  questionSchema,
  upsertCoverage,
} from "./generate"

type JobRow = typeof generationJob.$inferSelect

/**
 * Cron-driven poller for in-flight generation batches. For every job that
 * submitted a batch (`batchRef` set, still `running`), it checks the vendor
 * batch status; once the batch has finished, it fetches the results,
 * de-duplicates + inserts the items, records token usage per topic
 * (requirement A — even though the tokens only arrive now), and completes the
 * job. Individual failed items are marked in coverage so a re-run regenerates
 * only them. Each job is isolated so one bad batch can't block the others.
 */
export async function pollPendingBatches(): Promise<void> {
  const jobs = await db.query.generationJob.findMany({
    where: and(isNotNull(generationJob.batchRef), eq(generationJob.status, "running")),
  })
  for (const job of jobs) {
    try {
      await processBatchJob(job)
    } catch (error) {
      console.error("[batch-poll] job failed", job.id, error)
    }
  }
}

async function failBatch(job: JobRow, message: string): Promise<void> {
  await db
    .update(generationJob)
    .set({ status: "failed", error: message.slice(0, 500), batchRef: null })
    .where(eq(generationJob.id, job.id))
}

async function processBatchJob(job: JobRow): Promise<void> {
  if (!job.batchRef || !job.batchModel) return
  const provider = await resolveBatchProvider(job.batchModel, job.userId)
  if (!provider) {
    await failBatch(job, "Batch provider is no longer available")
    return
  }

  const status = await pollBatch(provider, job.batchRef)
  if (status === "processing") return
  if (status === "failed") {
    await failBatch(job, "Provider batch failed")
    return
  }

  const results = await fetchBatchResults(provider, job.batchRef)
  await applyBatchResults(job, results)
}

async function applyBatchResults(job: JobRow, results: BatchResult[]): Promise<void> {
  const embeddingRef = (await getSetting("ai"))?.defaultEmbeddingModel ?? null

  // Re-seed the de-duplicator from the target's existing items; the whole batch
  // is de-duped at once now that all topics arrive together.
  const deduper = new Deduper(0.9)
  const existingKeys = await loadExistingKeys(job.kind, job.targetId)
  deduper.seedKeys(existingKeys)
  if (embeddingRef && existingKeys.length > 0) {
    deduper.seedVectors(await embedTexts(job.userId, embeddingRef, existingKeys))
  }

  const topicRows = results.length
    ? await db.query.outlineTopic.findMany({
        where: inArray(
          outlineTopic.id,
          results.map((r) => r.customId)
        ),
        columns: { id: true, title: true },
      })
    : []
  const titleById = new Map(topicRows.map((t) => [t.id, t.title]))

  let topicsDone = job.topicsDone
  let producedTotal = job.producedCount

  for (const res of results) {
    let produced = 0
    let ok = false
    if (res.object != null) {
      try {
        if (job.kind === "deck") {
          const parsed = cardSchema.safeParse(res.object)
          if (!parsed.success) throw new Error("schema mismatch")
          produced = await persistCards(
            job.userId,
            job.targetId,
            deduper,
            embeddingRef,
            parsed.data.cards
          )
        } else {
          const parsed = questionSchema.safeParse(res.object)
          if (!parsed.success) throw new Error("schema mismatch")
          produced = await persistQuestions(
            job.userId,
            job.targetId,
            deduper,
            embeddingRef,
            parsed.data.questions
          )
        }
        ok = true
      } catch (error) {
        console.error("[batch-poll] item failed", res.customId, error)
      }
    }

    await upsertCoverage(job.targetId, res.customId, job.id, ok ? "done" : "failed", produced)

    // Requirement A: the token ledger records every AI action's usage — matching
    // the live path (which also logs usage per topic without a per-topic audit
    // entry), just with the tokens that only became available now.
    const ctx: AiCallContext = {
      userId: job.userId,
      model: job.batchModel ?? "batch",
      feature: job.kind === "deck" ? "flashcards" : "quiz",
      operation: "ai_generate",
      jobId: job.id,
      entityType: job.kind,
      entityId: job.targetId,
      entityLabel: titleById.get(res.customId) ?? res.customId,
      itemCount: produced,
    }
    try {
      await recordAiUsage(ctx, {
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        totalTokens: res.usage.inputTokens + res.usage.outputTokens,
      })
    } catch (error) {
      console.error("[batch-poll] usage logging failed", error)
    }

    topicsDone++
    producedTotal += produced
  }

  await db
    .update(generationJob)
    .set({ status: "completed", batchRef: null, topicsDone, producedCount: producedTotal })
    .where(eq(generationJob.id, job.id))
}
