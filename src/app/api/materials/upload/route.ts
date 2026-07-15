import { NextResponse } from "next/server"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { deleteFile, safeInlineMime, saveStream, StorageLimitError } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"
import { findOrCreateFolderPath, ownFolder, splitPath } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { isZip } from "@/lib/materials/paths"

// Uploads stream the raw request body straight to disk (see saveStream) instead
// of buffering the whole file in memory via formData()/arrayBuffer(). Metadata
// travels in query params + the x-file-name header so multi-GB files never need
// to fit in RAM.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const url = new URL(request.url)
  const moduleId = (url.searchParams.get("moduleId") ?? "").trim()
  const folderId = (url.searchParams.get("folderId") ?? "").trim() || null
  const relativePath = (url.searchParams.get("relativePath") ?? "").trim()
  const fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "").trim()
  const mimeType = request.headers.get("content-type")

  if (!request.body || !fileName || !moduleId) {
    return NextResponse.json({ error: "file body, x-file-name and moduleId required" }, { status: 400 })
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
  const maxUploadMb = uploads?.maxUploadMb ?? 200
  const maxBytes = maxUploadMb * 1024 * 1024

  // Early rejection using the declared Content-Length (best effort — the stream
  // is also hard-capped at maxBytes below).
  const declaredLength = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${maxUploadMb} MB)` }, { status: 413 })
  }
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    try {
      await assertStorageWithinLimit(userId, declaredLength)
    } catch {
      return NextResponse.json({ error: "Storage quota exceeded" }, { status: 413 })
    }
  }

  // Resolve the destination folder: any leading directories of relativePath are
  // created (nested) under the current folder.
  let targetFolderId = folderId
  if (relativePath) {
    const segments = splitPath(path.posix.dirname(relativePath))
    targetFolderId = await findOrCreateFolderPath(userId, moduleId, segments, folderId)
  }

  let saved: { storagePath: string; size: number; hash: string }
  try {
    saved = await saveStream(userId, fileName, request.body, { maxBytes })
  } catch (error) {
    if (error instanceof StorageLimitError) {
      return NextResponse.json({ error: `File too large (max ${maxUploadMb} MB)` }, { status: 413 })
    }
    console.error("[upload] stream to disk failed", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }

  // Authoritative storage-quota check now that the real size is known.
  try {
    await assertStorageWithinLimit(userId, saved.size)
  } catch {
    await deleteFile(saved.storagePath)
    return NextResponse.json({ error: "Storage quota exceeded" }, { status: 413 })
  }

  // Zip archives are unpacked in the background into a same-named folder — the
  // archive itself is not kept as a material.
  if (isZip(fileName, mimeType)) {
    try {
      const { enqueueUnpackZip } = await import("@/lib/jobs")
      await enqueueUnpackZip({
        userId,
        moduleId,
        parentFolderId: targetFolderId,
        zipStoragePath: saved.storagePath,
        zipName: fileName,
      })
    } catch (error) {
      console.error("[upload] failed to enqueue unpack job", error)
      await deleteFile(saved.storagePath)
      return NextResponse.json({ error: "Failed to queue unpack" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, queued: true })
  }

  // Incremental reuse: an identical file (same content hash) already in this
  // module is not re-stored or re-processed.
  const duplicate = await db.query.material.findFirst({
    where: and(
      eq(material.userId, userId),
      eq(material.moduleId, moduleId),
      eq(material.contentHash, saved.hash)
    ),
    columns: { id: true },
  })
  if (duplicate) {
    await deleteFile(saved.storagePath)
    return NextResponse.json({ ok: true, deduped: true, id: duplicate.id })
  }

  const [created] = await db
    .insert(material)
    .values({
      userId,
      moduleId,
      kind: "file",
      name: fileName,
      storagePath: saved.storagePath,
      mimeType: safeInlineMime(mimeType),
      sizeBytes: saved.size,
      contentHash: saved.hash,
      folderId: targetFolderId,
      extractionStatus: "pending",
    })
    .returning()

  const { logAudit } = await import("@/lib/audit")
  await logAudit({
    userId,
    operation: "create",
    entityType: "material",
    entityId: created.id,
    entityLabel: fileName,
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
