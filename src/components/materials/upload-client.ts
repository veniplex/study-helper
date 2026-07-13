/** Shared client-side upload helpers for the materials feature. */

export type UploadItem = { file: File; relativePath?: string }

export type UploadProgress = { done: number; total: number; percent: number }

/** POSTs one file (with optional relative path) to the upload endpoint. */
function xhrUpload(
  body: FormData,
  onPercent: (percent: number) => void
): Promise<{ queued?: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/materials/upload")
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onPercent(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          resolve({})
        }
      } else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).error ?? xhr.statusText))
        } catch {
          reject(new Error(xhr.statusText))
        }
      }
    }
    xhr.onerror = () => reject(new Error("network error"))
    xhr.send(body)
  })
}

/**
 * Uploads a list of files sequentially, reporting progress. Each item may carry
 * a `relativePath` so the server can recreate a nested folder structure. Zip
 * files are unpacked server-side. Returns the number of items that reported a
 * background-queued response (zips).
 */
export async function uploadFiles(
  items: UploadItem[],
  opts: { moduleId: string; folderId: string | null; onProgress?: (p: UploadProgress) => void }
): Promise<{ queued: number }> {
  let queued = 0
  for (let i = 0; i < items.length; i++) {
    const { file, relativePath } = items[i]
    const body = new FormData()
    body.set("file", file)
    body.set("moduleId", opts.moduleId)
    if (opts.folderId) body.set("folderId", opts.folderId)
    if (relativePath) body.set("relativePath", relativePath)
    const res = await xhrUpload(body, (percent) =>
      opts.onProgress?.({ done: i, total: items.length, percent })
    )
    if (res.queued) queued++
  }
  opts.onProgress?.({ done: items.length, total: items.length, percent: 100 })
  return { queued }
}

// --- Directory drag & drop (FileSystem Entry API) ---------------------------

type FsReader = { readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void }
type FsEntry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (cb: (file: File) => void, err: (e: unknown) => void) => void
  createReader?: () => FsReader
}

function readAllEntries(reader: FsReader): Promise<FsEntry[]> {
  const all: FsEntry[] = []
  return new Promise((resolve, reject) => {
    const step = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all)
        else {
          all.push(...batch)
          step()
        }
      }, reject)
    }
    step()
  })
}

async function entryToItems(entry: FsEntry, prefix: string): Promise<UploadItem[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej))
    return [{ file, relativePath: prefix + entry.name }]
  }
  if (entry.isDirectory && entry.createReader) {
    const entries = await readAllEntries(entry.createReader())
    const items: UploadItem[] = []
    for (const child of entries) {
      items.push(...(await entryToItems(child, `${prefix}${entry.name}/`)))
    }
    return items
  }
  return []
}

/**
 * Extracts an upload list from a drop event's DataTransfer, recursing into
 * dropped folders via the FileSystem Entry API. Falls back to the flat file
 * list (with any `webkitRelativePath`) when the entry API is unavailable.
 */
export async function readDroppedItems(dataTransfer: DataTransfer): Promise<UploadItem[]> {
  const items = Array.from(dataTransfer.items ?? [])
  const supportsEntries =
    items.length > 0 &&
    typeof (items[0] as unknown as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === "function"

  if (supportsEntries) {
    const entries = items
      .map((it) => (it as unknown as { webkitGetAsEntry: () => FsEntry | null }).webkitGetAsEntry())
      .filter((e): e is FsEntry => e !== null)
    const result: UploadItem[] = []
    for (const entry of entries) {
      result.push(...(await entryToItems(entry, "")))
    }
    if (result.length > 0) return result
  }

  return Array.from(dataTransfer.files).map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined,
  }))
}
