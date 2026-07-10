import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { pushSubscription } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getVapidKeys } from "@/lib/push"

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
  const body = subscribeSchema.parse(await request.json())
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
      set: { userId: session.user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { endpoint } = z.object({ endpoint: z.string() }).parse(await request.json())
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
