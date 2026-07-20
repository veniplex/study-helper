// register() runs per runtime (and again on every hot reload in dev), so the
// shutdown hook is installed against a module-level guard to avoid stacking up
// duplicate listeners on the process.
let shutdownRegistered = false

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Start the job worker (embeddings, reminders) with the server.
    const { getBoss } = await import("@/lib/jobs")
    const boss = await getBoss()

    // Drain in-process jobs on SIGTERM/SIGINT — the same graceful stop the
    // dedicated worker performs (src/worker.ts). Without it, `docker stop`
    // SIGKILLs the server after its grace period and any running job stays
    // "active" in pg-boss until its lease expires (up to an hour).
    //
    // Registered here rather than at module scope on purpose: a top-level
    // function that imports @/lib/jobs makes that chain reachable from the Edge
    // instrumentation entry, which then fails the build over Node APIs (fs,
    // process.cwd) the Edge runtime doesn't have.
    if (!shutdownRegistered) {
      shutdownRegistered = true
      let shuttingDown = false
      const shutdown = async (signal: string) => {
        if (shuttingDown) return
        shuttingDown = true
        console.log(`[instrumentation] received ${signal}, draining…`)
        try {
          await boss.stop({ graceful: true })
        } catch (error) {
          console.error("[instrumentation] error during shutdown", error)
        }
        process.exit(0)
      }
      process.on("SIGTERM", () => void shutdown("SIGTERM"))
      process.on("SIGINT", () => void shutdown("SIGINT"))
    }

    // Optional demo data (admin + user test accounts with study content).
    if (process.env.SEED_TEST_DATA === "true") {
      const { runTestSeed } = await import("@/lib/seed")
      await runTestSeed().catch((error) => console.error("[seed] failed:", error))
    }
  }
}
