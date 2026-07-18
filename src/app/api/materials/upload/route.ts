import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { saveStream, StorageLimitError } from "@/lib/storage"
import { ownModule } from "@/lib/studies/access"
import { ownFolder } from "@/lib/materials/folders"
import { assertStorageWithinLimit } from "@/lib/materials/usage"
import { QuotaExceededError, registerUploadedFile } from "@/lib/materials/ingest"
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit"

// Uploads stream the raw request body straight to disk (see saveStream) instead
// of buffering the whole file in memory via formData()/arrayBuffer(). Metadata
// travels in query params + the x-file-name header so multi-GB files never need
// to fit in RAM.
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id
  // Generous window — a dropped folder uploads each file individually.
  if (!checkRateLimit(`upload:${userId}`, 300, 10 * 60 * 1000)) {
    return tooManyRequests()
  }

  const url = new URL(request.url)
  const moduleId = (url.searchParams.get("moduleId") ?? "").trim()
  const folderId = (url.searchParams.get("folderId") ?? "").trim() || null
  const relativePath = (url.searchParams.get("relativePath") ?? "").trim()
  let fileName: string
  try {
    fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Malformed x-file-name header" }, { status: 400 })
  }
  const mimeType = request.headers.get("content-type")

  if (!request.body || !fileName || !moduleId) {
    return NextResponse.json(
      { error: "file body, x-file-name and moduleId required" },
      { status: 400 }
    )
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

  // Folder resolution, quota, zip, dedup, insert + embedding are shared with the
  // tus resumable-upload finalizer (see @/lib/materials/ingest).
  try {
    const result = await registerUploadedFile({
      userId,
      moduleId,
      folderId,
      relativePath: relativePath || undefined,
      fileName,
      mimeType,
      saved,
    })
    if (result.kind === "queued") return NextResponse.json({ ok: true, queued: true })
    if (result.kind === "deduped")
      return NextResponse.json({ ok: true, deduped: true, id: result.id })
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: "Storage quota exceeded" }, { status: 413 })
    }
    console.error("[upload] register failed", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
