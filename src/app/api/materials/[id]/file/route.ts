import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { fileSize, fileStream, safeInlineMime } from "@/lib/storage"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id } = await params
  const row = await db.query.material.findFirst({
    where: and(eq(material.id, id), eq(material.userId, session.user.id)),
  })
  if (!row || row.kind !== "file" || !row.storagePath) {
    return new Response("Not found", { status: 404 })
  }

  // Confirm the file actually exists on disk before streaming: if it's
  // missing (e.g. storage misconfiguration), fail fast with a clean 404
  // instead of erroring mid-stream, which surfaces to clients as a broken
  // connection / 502 through the reverse proxy.
  let size: number
  try {
    size = await fileSize(row.storagePath)
  } catch {
    return new Response("Not found", { status: 404 })
  }
  // Re-sanitize at serve time so rows created before the upload-side
  // sanitization can't serve active content either.
  const mime = safeInlineMime(row.mimeType)
  const range = request.headers.get("range")

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    if (match && (match[1] || match[2])) {
      // "bytes=-N" is a suffix range: the last N bytes of the file
      // match[2] is non-empty here: the guard above requires match[1] || match[2].
      const start = match[1] ? parseInt(match[1], 10) : Math.max(size - parseInt(match[2]!, 10), 0)
      const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1
      if (start <= end && start < size) {
        return new Response(await fileStream(row.storagePath, start, end), {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
          },
        })
      }
      // A range was requested but is unsatisfiable (start past EOF, or start >
      // end). Per RFC 7233 answer 416 with `Content-Range: bytes */<size>`
      // rather than silently returning the full 200 body.
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size}`,
          "Accept-Ranges": "bytes",
        },
      })
    }
  }

  return new Response(await fileStream(row.storagePath), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    },
  })
}
