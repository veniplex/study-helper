import "server-only"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  buildRelPath,
  createUploadMeter,
  type SaveStreamResult,
  type StorageDriver,
} from "./driver"

/**
 * Local-disk storage for uploaded materials. All paths are relative to
 * UPLOAD_DIR so the database stays portable across hosts. This is the default
 * driver; behaviour is unchanged from before the driver abstraction existed.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")

function absolute(relPath: string): string {
  const abs = path.resolve(UPLOAD_DIR, relPath)
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) throw new Error("Invalid path")
  return abs
}

export class LocalStorageDriver implements StorageDriver {
  async saveBuffer(userId: string, filename: string, data: Buffer): Promise<string> {
    const relPath = buildRelPath(userId, filename)
    const abs = absolute(relPath)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, data)
    return relPath
  }

  async saveStream(
    userId: string,
    filename: string,
    body: ReadableStream<Uint8Array>,
    opts: { maxBytes?: number } = {}
  ): Promise<SaveStreamResult> {
    const relPath = buildRelPath(userId, filename)
    const abs = absolute(relPath)
    await mkdir(path.dirname(abs), { recursive: true })

    const { meter, hash, size } = createUploadMeter(opts)
    try {
      const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
      await pipeline(source, meter, createWriteStream(abs))
    } catch (error) {
      await unlink(abs).catch(() => {})
      throw error
    }

    return { storagePath: relPath, size: size(), hash: hash.digest("hex") }
  }

  async readBuffer(relPath: string): Promise<Buffer> {
    return readFile(absolute(relPath))
  }

  async deleteFile(relPath: string): Promise<void> {
    try {
      await unlink(absolute(relPath))
    } catch {
      // already gone — fine
    }
  }

  async fileSize(relPath: string): Promise<number> {
    return (await stat(absolute(relPath))).size
  }

  async fileStream(relPath: string, start?: number, end?: number): Promise<ReadableStream> {
    const nodeStream = createReadStream(absolute(relPath), start != null ? { start, end } : {})
    return Readable.toWeb(nodeStream) as ReadableStream
  }
}
