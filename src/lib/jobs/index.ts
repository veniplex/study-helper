import "server-only"
import { PgBoss } from "pg-boss"
import { env } from "@/lib/env"

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> }

export const QUEUE_EMBED_MATERIAL = "embed-material"
export const QUEUE_SUMMARIZE_MATERIAL = "summarize-material"
export const QUEUE_GENERATE_COVERAGE = "generate-coverage"
export const QUEUE_POLL_BATCHES = "poll-batches"
export const QUEUE_REINDEX_VECTORS = "reindex-vectors"
export const QUEUE_REEMBED_MATERIALS = "reembed-materials"
export const QUEUE_UNPACK_ZIP = "unpack-zip"
export const QUEUE_FINALIZE_UPLOAD = "finalize-upload"
export const QUEUE_SEND_REMINDERS = "send-reminders"
export const QUEUE_DAILY_PLAN = "daily-plan-reminder"
export const QUEUE_CHECK_UPDATES = "check-updates"
export const QUEUE_SWEEP_ORPHAN_FILES = "sweep-orphan-files"

const ALL_QUEUES = [
  QUEUE_EMBED_MATERIAL,
  QUEUE_SUMMARIZE_MATERIAL,
  QUEUE_GENERATE_COVERAGE,
  QUEUE_POLL_BATCHES,
  QUEUE_REINDEX_VECTORS,
  QUEUE_REEMBED_MATERIALS,
  QUEUE_UNPACK_ZIP,
  QUEUE_FINALIZE_UPLOAD,
  QUEUE_SEND_REMINDERS,
  QUEUE_DAILY_PLAN,
  QUEUE_CHECK_UPDATES,
  QUEUE_SWEEP_ORPHAN_FILES,
]

/** Payload for the orphan-file sweep: storage paths whose material rows were
 *  (or are about to be) removed by a cascade delete. */
export type SweepOrphanFilesPayload = { paths: string[] }

/** Whether this process should run job handlers in-process (default true). Set
 *  WORKERS_IN_PROCESS=false on the web tier when a dedicated worker runs. */
function workersInProcess(): boolean {
  return (process.env.WORKERS_IN_PROCESS ?? "true").toLowerCase() !== "false"
}

/**
 * Connects pg-boss, ensures every queue exists and installs the cron schedules.
 * Runs in every process that needs to enqueue jobs (web tier and worker alike).
 */
export async function startClient(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL })
  boss.on("error", (error: Error) => console.error("[pg-boss]", error))
  await boss.start()
  for (const queue of ALL_QUEUES) await boss.createQueue(queue)
  // pg-boss evaluates cron in the schedule's timezone. It defaults to UTC, which
  // makes "0 7 * * *" fire at 07:00 UTC — often the wrong local morning for a
  // self-hosted single-tenant deploy. `CRON_TZ` (IANA name, e.g.
  // "Europe/Berlin") overrides it; UTC stays the default.
  const tz = process.env.CRON_TZ || "UTC"
  await boss.schedule(QUEUE_SEND_REMINDERS, "*/5 * * * *", {}, { tz })
  await boss.schedule(QUEUE_POLL_BATCHES, "*/5 * * * *", {}, { tz })
  await boss.schedule(QUEUE_DAILY_PLAN, "0 7 * * *", {}, { tz })
  await boss.schedule(QUEUE_CHECK_UPDATES, "0 6 * * *", {}, { tz })
  return boss
}

/**
 * Registers all job handlers. Runs in whichever process should do the work —
 * the web server by default, or a standalone worker (see startDedicatedWorker)
 * when the web tier sets WORKERS_IN_PROCESS=false.
 */
export async function registerWorkers(boss: PgBoss): Promise<void> {
  await boss.work<{ materialId: string }>(QUEUE_EMBED_MATERIAL, async (jobs) => {
    const { processMaterial } = await import("@/lib/ai/rag")
    for (const job of jobs) {
      await processMaterial(job.data.materialId)
      // Summaries feed the module outline; run them after embedding.
      await enqueueSummarizeMaterial(job.data.materialId)
    }
  })

  await boss.work<{ materialId: string }>(QUEUE_SUMMARIZE_MATERIAL, async (jobs) => {
    const { summarizeMaterial } = await import("@/lib/ai/generation/summarize")
    for (const job of jobs) {
      await summarizeMaterial(job.data.materialId)
    }
  })

  await boss.work<{ jobId: string }>(QUEUE_GENERATE_COVERAGE, async (jobs) => {
    const { runCoverageGeneration } = await import("@/lib/ai/generation/generate")
    for (const job of jobs) {
      await runCoverageGeneration(job.data.jobId)
    }
  })

  await boss.work(QUEUE_POLL_BATCHES, async () => {
    const { pollPendingBatches } = await import("@/lib/ai/generation/batch-poll")
    await pollPendingBatches()
  })

  await boss.work(QUEUE_REINDEX_VECTORS, async () => {
    const { reindexVectors } = await import("@/lib/ai/ann")
    await reindexVectors()
  })

  await boss.work(QUEUE_REEMBED_MATERIALS, async () => {
    const { reembedStaleMaterials } = await import("@/lib/ai/reembed")
    await reembedStaleMaterials()
  })

  await boss.work<import("./unpack-zip").UnpackZipPayload>(QUEUE_UNPACK_ZIP, async (jobs) => {
    const { unpackZip } = await import("./unpack-zip")
    for (const job of jobs) {
      await unpackZip(job.data)
    }
  })

  await boss.work<import("@/lib/materials/tus-finalize").FinalizeUploadPayload>(
    QUEUE_FINALIZE_UPLOAD,
    async (jobs) => {
      const { finalizeUpload } = await import("@/lib/materials/tus-finalize")
      for (const job of jobs) {
        await finalizeUpload(job.data)
      }
    }
  )

  await boss.work(QUEUE_SEND_REMINDERS, async () => {
    const { sendDueReminders } = await import("./reminders")
    await sendDueReminders()
  })

  await boss.work(QUEUE_DAILY_PLAN, async () => {
    const { sendDailyPlanReminders } = await import("./reminders")
    await sendDailyPlanReminders()
  })

  await boss.work(QUEUE_CHECK_UPDATES, async () => {
    const { checkForUpdate } = await import("@/lib/update-check")
    try {
      await checkForUpdate()
    } catch (error) {
      console.error("[check-updates]", error)
    }
  })

  await boss.work<SweepOrphanFilesPayload>(QUEUE_SWEEP_ORPHAN_FILES, async (jobs) => {
    const { deleteFile } = await import("@/lib/storage")
    for (const job of jobs) {
      for (const path of job.data.paths) {
        // Best-effort: a path that's already gone (double-run, prior partial
        // sweep) is a no-op — never fail the whole batch over one missing file.
        try {
          await deleteFile(path)
        } catch (error) {
          console.warn("[sweep-orphan-files] delete failed", path, error)
        }
      }
    }
  })
}

async function start(): Promise<PgBoss> {
  const boss = await startClient()
  if (workersInProcess()) {
    await registerWorkers(boss)
    console.log("[pg-boss] job workers running in-process")
  } else {
    console.log(
      "[pg-boss] in-process workers disabled (WORKERS_IN_PROCESS=false) — expecting a dedicated worker"
    )
  }
  return boss
}

export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.boss) globalForBoss.boss = start()
  return globalForBoss.boss
}

/**
 * Entry point for a standalone worker process (see src/worker.ts). Registers
 * handlers unconditionally and caches the instance so the module's enqueue
 * helpers reuse the same connection instead of spinning up a second one.
 */
export function startDedicatedWorker(): Promise<PgBoss> {
  if (!globalForBoss.boss) {
    globalForBoss.boss = (async () => {
      const boss = await startClient()
      await registerWorkers(boss)
      console.log("[worker] pg-boss dedicated worker started")
      return boss
    })()
  }
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

export async function enqueueReindexVectors(): Promise<void> {
  const boss = await getBoss()
  // Long-running maintenance; only one at a time.
  await boss.send(
    QUEUE_REINDEX_VECTORS,
    {},
    { retryLimit: 0, singletonKey: "reindex", expireInSeconds: 7200 }
  )
}

export async function enqueueReembedMaterials(): Promise<void> {
  const boss = await getBoss()
  // Long-running backfill; one at a time, resumable via a manual re-trigger.
  await boss.send(
    QUEUE_REEMBED_MATERIALS,
    {},
    { retryLimit: 0, singletonKey: "reembed", expireInSeconds: 4 * 3600 }
  )
}

export async function enqueueUnpackZip(
  payload: import("./unpack-zip").UnpackZipPayload
): Promise<void> {
  const boss = await getBoss()
  // Unpacking isn't idempotent (would duplicate files), so don't retry.
  await boss.send(QUEUE_UNPACK_ZIP, payload, { retryLimit: 0 })
}

export async function enqueueFinalizeUpload(
  payload: import("@/lib/materials/tus-finalize").FinalizeUploadPayload
): Promise<void> {
  const boss = await getBoss()
  // singletonKey on the tus id coalesces a double onUploadFinish; the finalizer
  // removes the staging file when done, so a retry that finds it gone is a no-op.
  await boss.send(QUEUE_FINALIZE_UPLOAD, payload, {
    retryLimit: 3,
    retryDelay: 30,
    singletonKey: payload.tusId,
  })
}

/**
 * Enqueues deletion of storage blobs orphaned by a cascade delete (a program /
 * semester / module and all its materials). Deleting the underlying files is
 * deferred to this job so the delete action returns fast and a crash mid-sweep
 * just retries (each unlink is idempotent). Chunked so a huge subtree doesn't
 * produce one oversized job payload.
 */
export async function enqueueSweepOrphanFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const boss = await getBoss()
  const CHUNK = 500
  for (let i = 0; i < paths.length; i += CHUNK) {
    await boss.send(
      QUEUE_SWEEP_ORPHAN_FILES,
      { paths: paths.slice(i, i + CHUNK) },
      { retryLimit: 5, retryDelay: 60 }
    )
  }
}
