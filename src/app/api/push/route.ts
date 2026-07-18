import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { pushSubscription } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getVapidKeys } from "@/lib/push"
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { publicKey } = await getVapidKeys()
  const subscribed = await db.query.pushSubscription.findFirst({
    where: eq(pushSubscription.userId, session.user.id),
  })
  return NextResponse.json({ publicKey, subscribed: Boolean(subscribed) })
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!checkRateLimit(`push:${session.user.id}`, 20, 60 * 1000)) {
    return tooManyRequests()
  }
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }
  const body = parsed.data
  // An endpoint is a browser-issued capability URL; never let one account
  // silently take over a row that belongs to another account (endpoint is
  // unique). 409 tells the client to drop its browser subscription and
  // re-subscribe, which yields a fresh endpoint.
  const existing = await db.query.pushSubscription.findFirst({
    where: eq(pushSubscription.endpoint, body.endpoint),
    columns: { userId: true },
  })
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Subscription in use" }, { status: 409 })
  }
  await db
    .insert(pushSubscription)
    .values({
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      setWhere: eq(pushSubscription.userId, session.user.id),
    })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = z
    .object({ endpoint: z.string() })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const { endpoint } = parsed.data
  await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, session.user.id),
        eq(pushSubscription.endpoint, endpoint)
      )
    )
  return NextResponse.json({ ok: true })
}
