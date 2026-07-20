import { beforeEach, describe, expect, it, vi } from "vitest"

// registerUploadedFile is server-only and touches the DB, storage, quota,
// folder and job subsystems. Mock every one of those boundaries so the
// orchestration logic itself can be asserted without a DB or a filesystem.
vi.mock("server-only", () => ({}))

const findFirstMock = vi.fn()
const returningMock = vi.fn()
const insertValuesMock = vi.fn(() => ({ returning: returningMock }))
const insertMock = vi.fn(() => ({ values: insertValuesMock }))
const updateWhereMock = vi.fn()
const updateSetMock = vi.fn<
  (values: Record<string, unknown>) => { where: typeof updateWhereMock }
>(() => ({ where: updateWhereMock }))
const updateMock = vi.fn(() => ({ set: updateSetMock }))

vi.mock("@/db", () => ({
  db: {
    query: { material: { findFirst: (...args: unknown[]) => findFirstMock(...args) } },
    insert: () => insertMock(),
    update: () => updateMock(),
  },
}))
vi.mock("@/db/schema", () => ({
  material: { id: "id", userId: "userId", moduleId: "moduleId", contentHash: "contentHash" },
}))

const deleteFileMock = vi.fn()
vi.mock("@/lib/storage", () => ({
  deleteFile: (...args: unknown[]) => deleteFileMock(...args),
  safeInlineMime: (mime: string | null) => mime ?? "application/octet-stream",
}))

const assertStorageWithinLimitMock = vi.fn()
vi.mock("@/lib/materials/usage", () => ({
  assertStorageWithinLimit: (...args: unknown[]) => assertStorageWithinLimitMock(...args),
}))

const findOrCreateFolderPathMock = vi.fn()
vi.mock("@/lib/materials/folders", () => ({
  findOrCreateFolderPath: (...args: unknown[]) => findOrCreateFolderPathMock(...args),
  splitPath: (p: string | null | undefined) => (p && p !== "." ? p.split("/").filter(Boolean) : []),
}))

const enqueueEmbedMaterialMock = vi.fn()
const enqueueUnpackZipMock = vi.fn()
vi.mock("@/lib/jobs", () => ({
  enqueueEmbedMaterial: (...args: unknown[]) => enqueueEmbedMaterialMock(...args),
  enqueueUnpackZip: (...args: unknown[]) => enqueueUnpackZipMock(...args),
}))

const logAuditMock = vi.fn()
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

import { QuotaExceededError, registerUploadedFile, type RegisterInput } from "./ingest"

function input(overrides: Partial<RegisterInput> = {}): RegisterInput {
  return {
    userId: "user-1",
    moduleId: "module-1",
    folderId: null,
    fileName: "notes.pdf",
    mimeType: "application/pdf",
    saved: { storagePath: "user-1/abc-notes.pdf", size: 1234, hash: "hash-1" },
    ...overrides,
  }
}

describe("registerUploadedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    findFirstMock.mockResolvedValue(undefined)
    returningMock.mockResolvedValue([{ id: "material-1" }])
    assertStorageWithinLimitMock.mockResolvedValue(undefined)
    enqueueEmbedMaterialMock.mockResolvedValue(undefined)
    enqueueUnpackZipMock.mockResolvedValue(undefined)
    deleteFileMock.mockResolvedValue(undefined)
    logAuditMock.mockResolvedValue(undefined)
    updateWhereMock.mockResolvedValue(undefined)
  })

  it("inserts the material, enqueues embedding and reports it as created", async () => {
    const result = await registerUploadedFile(input())

    expect(result).toEqual({ kind: "created", id: "material-1" })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        moduleId: "module-1",
        kind: "file",
        name: "notes.pdf",
        storagePath: "user-1/abc-notes.pdf",
        sizeBytes: 1234,
        contentHash: "hash-1",
        folderId: null,
        extractionStatus: "pending",
      })
    )
    expect(enqueueEmbedMaterialMock).toHaveBeenCalledWith("material-1")
    expect(logAuditMock).toHaveBeenCalledTimes(1)
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("resolves nested folders from relativePath before inserting", async () => {
    findOrCreateFolderPathMock.mockResolvedValue("folder-9")

    await registerUploadedFile(input({ relativePath: "sem1/bio/notes.pdf", folderId: "root" }))

    expect(findOrCreateFolderPathMock).toHaveBeenCalledWith(
      "user-1",
      "module-1",
      ["sem1", "bio"],
      "root"
    )
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "folder-9" })
    )
  })

  it("deletes the stored object and throws when the quota is exceeded", async () => {
    assertStorageWithinLimitMock.mockRejectedValue(new Error("over quota"))

    await expect(registerUploadedFile(input())).rejects.toBeInstanceOf(QuotaExceededError)

    expect(deleteFileMock).toHaveBeenCalledWith("user-1/abc-notes.pdf")
    expect(insertMock).not.toHaveBeenCalled()
    expect(enqueueEmbedMaterialMock).not.toHaveBeenCalled()
  })

  it("queues a zip for background unpacking instead of storing it as a material", async () => {
    const result = await registerUploadedFile(
      input({ fileName: "archive.zip", mimeType: "application/zip" })
    )

    expect(result).toEqual({ kind: "queued" })
    expect(enqueueUnpackZipMock).toHaveBeenCalledWith({
      userId: "user-1",
      moduleId: "module-1",
      parentFolderId: null,
      zipStoragePath: "user-1/abc-notes.pdf",
      zipName: "archive.zip",
    })
    expect(insertMock).not.toHaveBeenCalled()
    expect(findFirstMock).not.toHaveBeenCalled()
    expect(enqueueEmbedMaterialMock).not.toHaveBeenCalled()
  })

  it("removes the archive and rethrows when the unpack job cannot be enqueued", async () => {
    const boom = new Error("queue down")
    enqueueUnpackZipMock.mockRejectedValue(boom)

    await expect(
      registerUploadedFile(input({ fileName: "archive.zip", mimeType: "application/zip" }))
    ).rejects.toBe(boom)

    expect(deleteFileMock).toHaveBeenCalledWith("user-1/abc-notes.pdf")
    expect(insertMock).not.toHaveBeenCalled()
  })

  it("drops a duplicate upload and returns the existing material id", async () => {
    findFirstMock.mockResolvedValue({ id: "material-existing" })

    const result = await registerUploadedFile(input())

    expect(result).toEqual({ kind: "deduped", id: "material-existing" })
    expect(deleteFileMock).toHaveBeenCalledWith("user-1/abc-notes.pdf")
    expect(insertMock).not.toHaveBeenCalled()
    expect(enqueueEmbedMaterialMock).not.toHaveBeenCalled()
  })

  it("marks the material failed but still succeeds when enqueueing embedding fails", async () => {
    enqueueEmbedMaterialMock.mockRejectedValue(new Error("queue down"))

    const result = await registerUploadedFile(input())

    expect(result).toEqual({ kind: "created", id: "material-1" })
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ extractionStatus: "failed" })
    )
    expect(updateSetMock.mock.calls[0]![0]).toHaveProperty("extractionError")
    expect(deleteFileMock).not.toHaveBeenCalled()
  })
})
