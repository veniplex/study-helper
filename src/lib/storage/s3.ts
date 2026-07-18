import "server-only"
import { Readable } from "node:stream"
import type { S3Client } from "@aws-sdk/client-s3"
import {
  buildRelPath,
  createUploadMeter,
  type SaveStreamResult,
  type StorageDriver,
} from "./driver"

type S3Config = {
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle: boolean
  keyPrefix: string
}

function readS3Config(): S3Config {
  const bucket = process.env.S3_BUCKET
  if (!bucket) {
    throw new Error("S3_BUCKET must be set when STORAGE_DRIVER=s3")
  }
  return {
    bucket,
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: /^(1|true|yes)$/i.test(process.env.S3_FORCE_PATH_STYLE ?? ""),
    keyPrefix: (process.env.S3_KEY_PREFIX ?? "").replace(/^\/+|\/+$/g, ""),
  }
}

/** Rejects keys that could escape the bucket / configured-prefix namespace. */
function assertSafeKey(relPath: string): void {
  if (
    !relPath ||
    relPath.startsWith("/") ||
    relPath.includes("\\") ||
    relPath.split("/").includes("..")
  ) {
    throw new Error("Invalid path")
  }
}

/**
 * S3 / S3-compatible object-storage driver (AWS S3, MinIO, Cloudflare R2, …).
 * The AWS SDK is imported lazily so the default local driver never loads it and
 * local deploys pay nothing for it. Credentials come from the standard AWS
 * credential chain (env vars or an IAM role); only region/endpoint/path-style
 * are read from our own env. The relative path from `buildRelPath` is the
 * canonical object key (optionally under S3_KEY_PREFIX), matching the local
 * driver so the value stored in the DB is identical across backends.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly cfg: S3Config
  private clientPromise?: Promise<S3Client>

  constructor() {
    this.cfg = readS3Config()
  }

  private async client(): Promise<S3Client> {
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(
        ({ S3Client: Client }) =>
          new Client({
            region: this.cfg.region,
            forcePathStyle: this.cfg.forcePathStyle,
            ...(this.cfg.endpoint ? { endpoint: this.cfg.endpoint } : {}),
          })
      )
    }
    return this.clientPromise
  }

  private key(relPath: string): string {
    assertSafeKey(relPath)
    return this.cfg.keyPrefix ? `${this.cfg.keyPrefix}/${relPath}` : relPath
  }

  async saveBuffer(userId: string, filename: string, data: Buffer): Promise<string> {
    const relPath = buildRelPath(userId, filename)
    const { PutObjectCommand } = await import("@aws-sdk/client-s3")
    const client = await this.client()
    await client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(relPath), Body: data })
    )
    return relPath
  }

  async saveStream(
    userId: string,
    filename: string,
    body: ReadableStream<Uint8Array>,
    opts: { maxBytes?: number } = {}
  ): Promise<SaveStreamResult> {
    const relPath = buildRelPath(userId, filename)
    const { Upload } = await import("@aws-sdk/lib-storage")
    const client = await this.client()

    const { meter, hash, size } = createUploadMeter(opts)
    const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
    // Capture the meter's error (e.g. StorageLimitError) so it can be rethrown
    // unwrapped — lib-storage would otherwise surface a generic stream error.
    let meterError: Error | undefined
    meter.once("error", (error: Error) => {
      meterError = error
    })
    source.pipe(meter)

    const upload = new Upload({
      client,
      params: { Bucket: this.cfg.bucket, Key: this.key(relPath), Body: meter },
    })
    try {
      await upload.done()
    } catch (error) {
      await upload.abort().catch(() => {})
      source.destroy()
      throw meterError ?? error
    }

    return { storagePath: relPath, size: size(), hash: hash.digest("hex") }
  }

  async readBuffer(relPath: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3")
    const client = await this.client()
    const res = await client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(relPath) })
    )
    const bytes = await res.Body!.transformToByteArray()
    return Buffer.from(bytes)
  }

  async deleteFile(relPath: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3")
      const client = await this.client()
      await client.send(
        new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(relPath) })
      )
    } catch (error) {
      // Delete is best-effort / idempotent, mirroring the local driver.
      console.warn("[storage:s3] delete failed", relPath, error)
    }
  }

  async fileSize(relPath: string): Promise<number> {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3")
    const client = await this.client()
    const res = await client.send(
      new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(relPath) })
    )
    return res.ContentLength ?? 0
  }

  async fileStream(relPath: string, start?: number, end?: number): Promise<ReadableStream> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3")
    const client = await this.client()
    const range = start != null ? `bytes=${start}-${end ?? ""}` : undefined
    const res = await client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(relPath), Range: range })
    )
    return Readable.toWeb(res.Body as Readable) as ReadableStream
  }
}
