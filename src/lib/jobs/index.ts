import "server-only"
import { PgBoss } from "pg-boss"
import { env } from "@/lib/env"

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> }

export const QUEUE_EMBED_MATERIAL = "embed-material"
export const QUEUE_SUMMARIZE_MATERIAL = "summarize-material"
export const QUEUE_GENERATE_COVERAGE = "generate-coverage"
export const QUEUE_UNPACK_ZIP = "unpack-zip"
export const QUEUE_SEND_REMINDERS = "send-reminders"
export const QUEUE_DAILY_PLAN = "daily-plan-reminder"
export const QUEUE_CHECK_UPDATES = "check-updates"

async function start(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL })
  boss.on("error", (error: Error) => console.error("[pg-boss]", error))
  await boss.start()
  await boss.createQueue(QUEUE_EMBED_MATERIAL)
  await boss.createQueue(QUEUE_SEND_REMINDERS)

  await boss.work<{ materialId: string }>(QUEUE_EMBED_MATERIAL, async (jobs) => {
    const { processMaterial } = await import("@/lib/ai/rag")
    for (const job of jobs) {
      await processMaterial(job.data.materialId)
      // Summaries feed the module outline; run them after embedding.
      await enqueueSummarizeMaterial(job.data.materialId)
    }
  })

  await boss.createQueue(QUEUE_SUMMARIZE_MATERIAL)
  await boss.work<{ materialId: string }>(QUEUE_SUMMARIZE_MATERIAL, async (jobs) => {
    const { summarizeMaterial } = await import("@/lib/ai/generation/summarize")
    for (const job of jobs) {
      await summarizeMaterial(job.data.materialId)
    }
  })

  await boss.createQueue(QUEUE_GENERATE_COVERAGE)
  await boss.work<{ jobId: string }>(QUEUE_GENERATE_COVERAGE, async (jobs) => {
    const { runCoverageGeneration } = await import("@/lib/ai/generation/generate")
    for (const job of jobs) {
      await runCoverageGeneration(job.data.jobId)
    }
  })

  await boss.createQueue(QUEUE_UNPACK_ZIP)
  await boss.work<import("./unpack-zip").UnpackZipPayload>(QUEUE_UNPACK_ZIP, async (jobs) => {
    const { unpackZip } = await import("./unpack-zip")
    for (const job of jobs) {
      await unpackZip(job.data)
    }
  })

  await boss.work(QUEUE_SEND_REMINDERS, async () => {
    const { sendDueReminders } = await import("./reminders")
    await sendDueReminders()
  })
  await boss.schedule(QUEUE_SEND_REMINDERS, "*/5 * * * *")

  await boss.createQueue(QUEUE_DAILY_PLAN)
  await boss.work(QUEUE_DAILY_PLAN, async () => {
    const { sendDailyPlanReminders } = await import("./reminders")
    await sendDailyPlanReminders()
  })
  await boss.schedule(QUEUE_DAILY_PLAN, "0 7 * * *")

  await boss.createQueue(QUEUE_CHECK_UPDATES)
  await boss.work(QUEUE_CHECK_UPDATES, async () => {
    const { checkForUpdate } = await import("@/lib/update-check")
    try {
      await checkForUpdate()
    } catch (error) {
      console.error("[check-updates]", error)
    }
  })
  await boss.schedule(QUEUE_CHECK_UPDATES, "0 6 * * *")

  return boss
}

export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.boss) globalForBoss.boss = start()
  return globalForBoss.boss
}

export async function enqueueEmbedMaterial(materialId: string): Promise<void> {
  const boss = await getBoss()
  // singletonKey coalesces duplicate enqueues for the same material; processing
  // is idempotent/resumable so retries pick up where a crash left off.
  await boss.send(
    QUEUE_EMBED_MATERIAL,
    { materialId },
    { retryLimit: 5, retryDelay: 30, singletonKey: materialId }
  )
}

export async function enqueueSummarizeMaterial(materialId: string): Promise<void> {
  const boss = await getBoss()
  await boss.send(
    QUEUE_SUMMARIZE_MATERIAL,
    { materialId },
    { retryLimit: 3, retryDelay: 30, singletonKey: materialId }
  )
}

export async function enqueueGeneration(jobId: string): Promise<void> {
  const boss = await getBoss()
  // Coverage generation can run for minutes over a large corpus — allow a long
  // lease. Processing is resumable (done topics are skipped) so a retry is safe.
  await boss.send(
    QUEUE_GENERATE_COVERAGE,
    { jobId },
    { retryLimit: 2, retryDelay: 60, singletonKey: jobId, expireInSeconds: 3600 }
  )
}

export async function enqueueUnpackZip(
  payload: import("./unpack-zip").UnpackZipPayload
): Promise<void> {
  const boss = await getBoss()
  // Unpacking isn't idempotent (would duplicate files), so don't retry.
  await boss.send(QUEUE_UNPACK_ZIP, payload, { retryLimit: 0 })
}
