import { describe, expect, it } from "vitest"
import { unzipSync, zipSync } from "fflate"
import { planZipEntries, sanitizeSegment, splitPath } from "./paths"

describe("sanitizeSegment", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeSegment("  a   b  ")).toBe("a b")
  })
  it("replaces slashes with spaces", () => {
    expect(sanitizeSegment("a/b\\c")).toBe("a b c")
  })
  it("rejects empty, dot and dotdot", () => {
    expect(sanitizeSegment("")).toBeNull()
    expect(sanitizeSegment("   ")).toBeNull()
    expect(sanitizeSegment(".")).toBeNull()
    expect(sanitizeSegment("..")).toBeNull()
  })
  it("caps length at 100 chars", () => {
    expect(sanitizeSegment("x".repeat(200))).toHaveLength(100)
  })
})

describe("splitPath", () => {
  it("splits and sanitizes segments", () => {
    expect(splitPath("lecture/week 1/notes")).toEqual(["lecture", "week 1", "notes"])
  })
  it("drops empty and traversal segments", () => {
    expect(splitPath("a//../b/")).toEqual(["a", "b"])
  })
  it("returns [] for null/empty", () => {
    expect(splitPath(null)).toEqual([])
    expect(splitPath("")).toEqual([])
  })
})

describe("planZipEntries", () => {
  function zip(files: Record<string, string>): Record<string, Uint8Array> {
    const enc = new TextEncoder()
    const input: Record<string, Uint8Array> = {}
    for (const [k, v] of Object.entries(files)) input[k] = enc.encode(v)
    // round-trip through fflate to mirror real unzip output
    return unzipSync(zipSync(input))
  }

  it("preserves nested folder structure", () => {
    const plan = planZipEntries(zip({ "a/b/c.txt": "x", "a/d.txt": "y", "top.txt": "z" }))
    const byName = Object.fromEntries(plan.map((e) => [e.name, e.segments]))
    expect(byName["c.txt"]).toEqual(["a", "b"])
    expect(byName["d.txt"]).toEqual(["a"])
    expect(byName["top.txt"]).toEqual([])
  })

  it("rejects zip-slip traversal entries", () => {
    const plan = planZipEntries(zip({ "../evil.txt": "x", "ok.txt": "y" }))
    expect(plan.map((e) => e.name)).toEqual(["ok.txt"])
  })

  it("skips __MACOSX and dotfiles", () => {
    const plan = planZipEntries(zip({ "__MACOSX/x": "x", ".DS_Store": "y", "real.txt": "z" }))
    expect(plan.map((e) => e.name)).toEqual(["real.txt"])
  })

  it("throws when entry count cap is exceeded", () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 5; i++) files[`f${i}.txt`] = "x"
    expect(() => planZipEntries(zip(files), { maxEntries: 3 })).toThrow(/too many files/)
  })

  it("throws when uncompressed size cap is exceeded", () => {
    expect(() =>
      planZipEntries(zip({ "big.txt": "x".repeat(100) }), { maxTotalBytes: 10 })
    ).toThrow(/maximum uncompressed size/)
  })
})
