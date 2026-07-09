export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Start the job worker (embeddings, reminders) with the server.
    const { getBoss } = await import("@/lib/jobs")
    await getBoss()
  }
}
