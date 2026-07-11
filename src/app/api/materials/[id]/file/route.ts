import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { fileSize, fileStream, safeInlineMime } from "@/lib/storage"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id } = await params
  const row = await db.query.material.findFirst({
    where: and(eq(material.id, id), eq(material.userId, session.user.id)),
  })
  if (!row || row.kind !== "file" || !row.storagePath) {
    return new Response("Not found", { status: 404 })
  }

  const size = row.sizeBytes ?? (await fileSize(row.storagePath))
  // Re-sanitize at serve time so rows created before the upload-side
  // sanitization can't serve active content either.
  const mime = safeInlineMime(row.mimeType)
  const range = request.headers.get("range")

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    if (match && (match[1] || match[2])) {
      // "bytes=-N" is a suffix range: the last N bytes of the file
      const start = match[1]
        ? parseInt(match[1], 10)
        : Math.max(size - parseInt(match[2], 10), 0)
      const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1
      if (start <= end && start < size) {
        return new Response(fileStream(row.storagePath, start, end), {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
          },
        })
      }
    }
  }

  return new Response(fileStream(row.storagePath), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    },
  })
}
