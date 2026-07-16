import "server-only"
import type { SaveStreamResult, StorageDriver } from "./driver"
import { LocalStorageDriver } from "./local"

export { safeInlineMime, StorageLimitError } from "./driver"
export type { SaveStreamResult } from "./driver"

/**
 * Storage backend selection. `local` (default) writes to UPLOAD_DIR on disk;
 * `s3` uses S3 / S3-compatible object storage (see ./s3). The driver is created
 * once and cached, and the AWS SDK is only loaded when `s3` is selected, so the
 * default local path is byte-for-byte unchanged and pays nothing for S3.
 */
function driverName(): "local" | "s3" {
  return (process.env.STORAGE_DRIVER ?? "local").toLowerCase() === "s3" ? "s3" : "local"
}

let driverPromise: Promise<StorageDriver> | undefined

function getDriver(): Promise<StorageDriver> {
  if (!driverPromise) {
    driverPromise =
      driverName() === "s3"
        ? import("./s3").then(({ S3StorageDriver }) => new S3StorageDriver())
        : Promise.resolve(new LocalStorageDriver())
  }
  return driverPromise
}

/** Stores a buffer and returns the relative storage path. */
export async function saveFile(userId: string, filename: string, data: Buffer): Promise<string> {
  return (await getDriver()).saveBuffer(userId, filename, data)
}

/**
 * Streams an upload straight to storage without ever holding the whole file in
 * memory, computing the byte size and a sha256 content hash as it goes. Enforces
 * `maxBytes` mid-stream and removes the partial object if the limit is exceeded
 * or the stream errors.
 */
export async function saveStream(
  userId: string,
  filename: string,
  body: ReadableStream<Uint8Array>,
  opts: { maxBytes?: number } = {}
): Promise<SaveStreamResult> {
  return (await getDriver()).saveStream(userId, filename, body, opts)
}

/** Persists extracted plain text out of the DB and returns its path. */
export async function saveText(userId: string, filename: string, text: string): Promise<string> {
  return (await getDriver()).saveBuffer(userId, filename, Buffer.from(text, "utf8"))
}

/** Reads a stored UTF-8 text file (e.g. extracted material text). */
export async function readStoredText(relPath: string): Promise<string> {
  return (await (await getDriver()).readBuffer(relPath)).toString("utf8")
}

/** Reads a stored file fully into a Buffer (binary-safe). */
export async function readFileBuffer(relPath: string): Promise<Buffer> {
  return (await getDriver()).readBuffer(relPath)
}

export async function deleteFile(relPath: string): Promise<void> {
  return (await getDriver()).deleteFile(relPath)
}

export async function fileSize(relPath: string): Promise<number> {
  return (await getDriver()).fileSize(relPath)
}

/** Returns a Web ReadableStream for a stored file, optionally a byte range. */
export async function fileStream(
  relPath: string,
  start?: number,
  end?: number
): Promise<ReadableStream> {
  return (await getDriver()).fileStream(relPath, start, end)
}
