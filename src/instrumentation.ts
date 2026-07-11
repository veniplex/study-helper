export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Start the job worker (embeddings, reminders) with the server.
    const { getBoss } = await import("@/lib/jobs")
    await getBoss()

    // Optional demo data (admin + user test accounts with study content).
    if (process.env.SEED_TEST_DATA === "true") {
      const { runTestSeed } = await import("@/lib/seed")
      await runTestSeed().catch((error) => console.error("[seed] failed:", error))
    }
  }
}
