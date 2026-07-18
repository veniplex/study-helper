import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { truncateUtf8 } from "./extract"

describe("truncateUtf8", () => {
  it("returns short buffers untouched", () => {
    expect(truncateUtf8(Buffer.from("hello"), 100)).toBe("hello")
  })

  it("cuts exactly at the limit on ASCII", () => {
    expect(truncateUtf8(Buffer.from("abcdef"), 3)).toBe("abc")
  })

  it("never splits a multi-byte character", () => {
    // "ä" is 2 bytes; cutting at byte 3 would land inside the second "ä".
    const text = "aää" // bytes: a(1) ä(2) ä(2) = 5
    const result = truncateUtf8(Buffer.from(text), 4)
    expect(result).toBe("aä")
    expect(result).not.toContain("�")
  })

  it("handles 4-byte emoji at the boundary", () => {
    const text = "ab😀" // bytes: 2 + 4 = 6
    for (const cut of [3, 4, 5]) {
      const result = truncateUtf8(Buffer.from(text), cut)
      expect(result).toBe("ab")
    }
    expect(truncateUtf8(Buffer.from(text), 6)).toBe("ab😀")
  })
})
