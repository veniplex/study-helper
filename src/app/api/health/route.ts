import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({ status: "ok", database: "up" })
  } catch {
    return NextResponse.json({ status: "degraded", database: "down" }, { status: 503 })
  }
}
