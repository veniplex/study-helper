import "server-only"
import webpush from "web-push"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { pushSubscription } from "@/db/schema"
import { env } from "./env"
import { getSetting, setSetting } from "./settings"

export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const existing = await getSetting("push.vapid")
  if (existing) return existing
  const keys = webpush.generateVAPIDKeys()
  await setSetting("push.vapid", keys)
  return keys
}

export type PushPayload = { title: string; body?: string; url?: string }

/** Sends a push notification to all of the user's subscriptions. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await db.query.pushSubscription.findMany({
    where: eq(pushSubscription.userId, userId),
  })
  if (subscriptions.length === 0) return

  const vapid = await getVapidKeys()
  webpush.setVapidDetails(`mailto:admin@${new URL(env.APP_URL).hostname}`, vapid.publicKey, vapid.privateKey)

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id))
        } else {
          console.error("[push] send failed", error)
        }
      }
    })
  )
}
