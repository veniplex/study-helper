import { NextResponse } from "next/server"
import path from "node:path"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { safeInlineMime, saveFile } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"
import { findOrCreateFolderPath, ownFolder, splitPath } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { isZip } from "@/lib/materials/paths"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const form = await request.formData()
  const file = form.get("file")
  const moduleId = String(form.get("moduleId") ?? "")
  // The folder the user is currently in (breadcrumb context), if any.
  const folderId = String(form.get("folderId") ?? "").trim() || null
  // For folder/directory uploads: the file's path relative to the dropped root.
  const relativePath = String(form.get("relativePath") ?? "").trim()

  if (!(file instanceof File) || !moduleId) {
    return NextResponse.json({ error: "file and moduleId required" }, { status: 400 })
  }

  try {
    await ownModule(moduleId, userId)
    if (folderId) {
      const folder = await ownFolder(folderId, userId)
      if (folder.moduleId !== moduleId) throw new Error("mismatch")
    }
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

  // Resolve the destination folder: any leading directories of relativePath are
  // created (nested) under the current folder.
  let targetFolderId = folderId
  if (relativePath) {
    const segments = splitPath(path.posix.dirname(relativePath))
    targetFolderId = await findOrCreateFolderPath(userId, moduleId, segments, folderId)
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Zip archives are unpacked in the background into a same-named folder — the
  // archive itself is not kept as a material.
  if (isZip(file.name, file.type)) {
    const zipStoragePath = await saveFile(userId, file.name, buffer)
    try {
      const { enqueueUnpackZip } = await import("@/lib/jobs")
      await enqueueUnpackZip({
        userId,
        moduleId,
        parentFolderId: targetFolderId,
        zipStoragePath,
        zipName: file.name,
      })
    } catch (error) {
      console.error("[upload] failed to enqueue unpack job", error)
      return NextResponse.json({ error: "Failed to queue unpack" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, queued: true })
  }

  try {
    await assertStorageWithinLimit(userId, file.size)
  } catch {
    return NextResponse.json({ error: "Storage quota exceeded" }, { status: 413 })
  }

  const storagePath = await saveFile(userId, file.name, buffer)

  const [created] = await db
    .insert(material)
    .values({
      userId,
      moduleId,
      kind: "file",
      name: file.name,
      storagePath,
      mimeType: safeInlineMime(file.type),
      sizeBytes: file.size,
      folderId: targetFolderId,
    })
    .returning()

  const { logAudit } = await import("@/lib/audit")
  await logAudit({
    userId,
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
