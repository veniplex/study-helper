import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { mockClient } from "aws-sdk-client-mock"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The storage modules import "server-only", which throws outside a React Server
// Component bundle (i.e. under vitest). Neutralise it for this unit test.
vi.mock("server-only", () => ({}))

const s3Mock = mockClient(S3Client)

/** Wraps a fake body as a GetObject output without leaking `any`. */
function getOutput(body: unknown): GetObjectCommandOutput {
  return { Body: body } as unknown as GetObjectCommandOutput
}

async function readWebStream(stream: ReadableStream): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

describe("S3StorageDriver", () => {
  const OPTIONAL_ENV = ["S3_REGION", "S3_ENDPOINT", "S3_FORCE_PATH_STYLE", "S3_KEY_PREFIX"]

  beforeEach(() => {
    s3Mock.reset()
    process.env.S3_BUCKET = "test-bucket"
    for (const key of OPTIONAL_ENV) delete process.env[key]
  })

  async function makeDriver(env: Record<string, string | undefined> = {}) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    const { S3StorageDriver } = await import("./s3")
    return new S3StorageDriver()
  }

  it("requires S3_BUCKET", async () => {
    await expect(makeDriver({ S3_BUCKET: undefined })).rejects.toThrow(/S3_BUCKET/)
  })

  it("saveBuffer PUTs the object under the canonical key and returns the rel path", async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const driver = await makeDriver()
    const relPath = await driver.saveBuffer("user-1", "notes.pdf", Buffer.from("data"))

    expect(relPath).toMatch(/^user-1\/[0-9a-f-]+-notes\.pdf$/)
    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0].args[0].input.Bucket).toBe("test-bucket")
    expect(calls[0].args[0].input.Key).toBe(relPath)
  })

  it("prepends S3_KEY_PREFIX to the object key but keeps the rel path prefix-free", async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const driver = await makeDriver({ S3_KEY_PREFIX: "media" })
    const relPath = await driver.saveBuffer("user-1", "a.txt", Buffer.from("x"))

    expect(relPath.startsWith("user-1/")).toBe(true)
    expect(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Key).toBe(`media/${relPath}`)
  })

  it("readBuffer returns the object bytes", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves(getOutput({ transformToByteArray: async () => new Uint8Array([104, 105]) }))
    const driver = await makeDriver()
    const buf = await driver.readBuffer("user-1/x-a.txt")
    expect(buf.toString("utf8")).toBe("hi")
  })

  it("fileSize returns ContentLength from a HEAD request", async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 42 })
    const driver = await makeDriver()
    expect(await driver.fileSize("user-1/x-a.txt")).toBe(42)
  })

  it("fileStream requests a byte range and streams the body", async () => {
    s3Mock.on(GetObjectCommand).resolves(getOutput(Readable.from([Buffer.from("hello")])))
    const driver = await makeDriver()
    const stream = await driver.fileStream("user-1/x-a.txt", 0, 4)

    expect(await readWebStream(stream)).toEqual(Buffer.from("hello"))
    expect(s3Mock.commandCalls(GetObjectCommand)[0].args[0].input.Range).toBe("bytes=0-4")
  })

  it("fileStream omits the Range header when no range is given", async () => {
    s3Mock.on(GetObjectCommand).resolves(getOutput(Readable.from([Buffer.from("full")])))
    const driver = await makeDriver()
    await driver.fileStream("user-1/x-a.txt")
    expect(s3Mock.commandCalls(GetObjectCommand)[0].args[0].input.Range).toBeUndefined()
  })

  it("deleteFile issues a DELETE and swallows errors (idempotent)", async () => {
    s3Mock.on(DeleteObjectCommand).rejects(new Error("boom"))
    const driver = await makeDriver()
    await expect(driver.deleteFile("user-1/x-a.txt")).resolves.toBeUndefined()
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })

  it("rejects keys that try to escape the namespace", async () => {
    const driver = await makeDriver()
    await expect(driver.readBuffer("../secret")).rejects.toThrow(/Invalid path/)
  })
})

describe("LocalStorageDriver", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "storage-test-"))
    process.env.UPLOAD_DIR = dir
    vi.resetModules() // re-read UPLOAD_DIR at module load
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("round-trips a buffer through save/read/size and deletes it", async () => {
    const { LocalStorageDriver } = await import("./local")
    const driver = new LocalStorageDriver()

    const relPath = await driver.saveBuffer("user-1", "a.txt", Buffer.from("hello world"))
    expect(relPath).toMatch(/^user-1\/[0-9a-f-]+-a\.txt$/)
    expect((await driver.readBuffer(relPath)).toString("utf8")).toBe("hello world")
    expect(await driver.fileSize(relPath)).toBe(11)

    await driver.deleteFile(relPath)
    await expect(driver.fileSize(relPath)).rejects.toBeTruthy()
    await expect(driver.deleteFile(relPath)).resolves.toBeUndefined() // idempotent
  })

  it("streams to disk while computing size + sha256 and honours maxBytes", async () => {
    const { LocalStorageDriver } = await import("./local")
    const { StorageLimitError } = await import("./driver")
    const driver = new LocalStorageDriver()

    const payload = Buffer.from("the quick brown fox")
    const body = Readable.toWeb(Readable.from([payload])) as ReadableStream<Uint8Array>
    const result = await driver.saveStream("user-1", "f.bin", body)

    expect(result.size).toBe(payload.length)
    expect(result.hash).toBe(createHash("sha256").update(payload).digest("hex"))
    expect((await driver.readBuffer(result.storagePath)).equals(payload)).toBe(true)

    const big = Readable.toWeb(Readable.from([Buffer.alloc(100)])) as ReadableStream<Uint8Array>
    await expect(
      driver.saveStream("user-1", "big.bin", big, { maxBytes: 10 })
    ).rejects.toBeInstanceOf(StorageLimitError)
  })

  it("serves a byte range via fileStream", async () => {
    const { LocalStorageDriver } = await import("./local")
    const driver = new LocalStorageDriver()
    const relPath = await driver.saveBuffer("user-1", "r.txt", Buffer.from("0123456789"))

    const stream = await driver.fileStream(relPath, 2, 5)
    const chunks: Uint8Array[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    expect(Buffer.concat(chunks).toString("utf8")).toBe("2345")
  })
})
