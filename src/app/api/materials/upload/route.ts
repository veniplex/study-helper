import { NextResponse } from "next/server"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { safeInlineMime, saveFile } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await request.formData()
  const file = form.get("file")
  const moduleId = String(form.get("moduleId") ?? "")
  const folder = String(form.get("folder") ?? "").trim().slice(0, 100) || null

  if (!(file instanceof File) || !moduleId) {
    return NextResponse.json({ error: "file and moduleId required" }, { status: 400 })
  }

  try {
    await ownModule(moduleId, session.user.id)
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const uploads = await getSetting("uploads")
  const maxBytes = (uploads?.maxUploadMb ?? 200) * 1024 * 1024
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large (max ${uploads?.maxUploadMb ?? 200} MB)` },
      { status: 413 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = await saveFile(session.user.id, file.name, buffer)

  const [created] = await db
    .insert(material)
    .values({
      userId: session.user.id,
      moduleId,
      kind: "file",
      name: file.name,
      storagePath,
      mimeType: safeInlineMime(file.type),
      sizeBytes: file.size,
      folder,
    })
    .returning()

  const { logAudit } = await import("@/lib/audit")
  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "material",
    entityId: created.id,
    entityLabel: file.name,
    after: created,
  })

  // Kick off text extraction + embedding in the background
  try {
    const { enqueueEmbedMaterial } = await import("@/lib/jobs")
    await enqueueEmbedMaterial(created.id)
  } catch (error) {
    console.error("[upload] failed to enqueue embedding job", error)
  }

  return NextResponse.json({ ok: true, id: created.id })
}
