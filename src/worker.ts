/**
 * Standalone job-worker process.
 *
 * Run this instead of (or alongside) the Next.js server to execute background
 * jobs — text extraction, embedding, summarization and coverage generation —
 * off the web tier. Start the web server with WORKERS_IN_PROCESS=false so it
 * only enqueues, and run one or more of these workers; pg-boss distributes jobs
 * across all connected workers.
 *
 *   WORKERS_IN_PROCESS=false  (on the web server)
 *   npm run worker            (one or more worker processes)
 *
 * Requires the same environment as the app (DATABASE_URL, AI keys, UPLOAD_DIR,
 * …). Run via tsx with the react-server condition so `server-only` is a no-op
 * (see the "worker" npm script).
 */
import { startDedicatedWorker } from "@/lib/jobs"

async function main(): Promise<void> {
  const boss = await startDedicatedWorker()

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[worker] received ${signal}, draining…`)
    try {
      await boss.stop({ graceful: true })
    } catch (error) {
      console.error("[worker] error during shutdown", error)
    }
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))

  console.log("[worker] ready — waiting for jobs")
}

void main().catch((error) => {
  console.error("[worker] fatal", error)
  process.exit(1)
})
