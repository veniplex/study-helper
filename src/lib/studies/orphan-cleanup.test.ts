import { describe, expect, it } from "vitest"
import { collectStoragePaths } from "./storage-paths"

describe("collectStoragePaths", () => {
  it("collects both the file blob and the extracted-text blob of each material", () => {
    expect(
      collectStoragePaths([
        { storagePath: "u1/a.pdf", textStoragePath: "u1/a.txt" },
        { storagePath: "u1/b.png", textStoragePath: "u1/b.txt" },
      ])
    ).toEqual(["u1/a.pdf", "u1/a.txt", "u1/b.png", "u1/b.txt"])
  })

  it("skips null paths (link materials, un-extracted files)", () => {
    expect(
      collectStoragePaths([
        { storagePath: null, textStoragePath: null }, // link material
        { storagePath: "u1/c.pdf", textStoragePath: null }, // not yet extracted
        { storagePath: null, textStoragePath: "u1/orphan.txt" },
      ])
    ).toEqual(["u1/c.pdf", "u1/orphan.txt"])
  })

  it("returns an empty list for no rows", () => {
    expect(collectStoragePaths([])).toEqual([])
  })
})
