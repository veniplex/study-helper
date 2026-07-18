import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { deleteFile, saveFile } from "@/lib/storage"

export const dynamic = "force-dynamic"

/**
 * Verifies the storage backend accepts writes. A read-only uploads volume
 * (classic Docker bind-mount ownership problem) is the most common reason
 * "uploads don't work" — surface it here instead of as opaque 500s.
 */
async function checkStorage(): Promise<boolean> {
  const probe = `health-${crypto.randomUUID()}.txt`
  try {
    const path = await saveFile("_health", probe, Buffer.from("ok"))
    await deleteFile(path)
    return true
  } catch (error) {
    console.error("[health] storage write check failed", error)
    return false
  }
}

export async function GET() {
  let database = "up"
  try {
    await db.execute(sql`select 1`)
  } catch {
    database = "down"
  }
  const storage = (await checkStorage()) ? "up" : "down"
  const ok = database === "up" && storage === "up"
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, storage },
    { status: ok ? 200 : 503 }
  )
}
