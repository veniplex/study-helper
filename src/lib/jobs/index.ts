import "server-only"
import { PgBoss } from "pg-boss"
import { env } from "@/lib/env"

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> }

export const QUEUE_EMBED_MATERIAL = "embed-material"
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
  await boss.send(QUEUE_EMBED_MATERIAL, { materialId }, { retryLimit: 2, retryDelay: 30 })
}
