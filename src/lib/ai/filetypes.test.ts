import { describe, expect, it } from "vitest"
import { classifyFile, extOf } from "./filetypes"

describe("extOf", () => {
  it("returns lowercased extension", () => {
    expect(extOf("a/b/File.PDF")).toBe(".pdf")
    expect(extOf("noext")).toBe("")
  })
})

describe("classifyFile", () => {
  it("routes documents by extension", () => {
    expect(classifyFile("x/uuid-a.pdf", "application/octet-stream")).toBe("pdf")
    expect(classifyFile("x/uuid-a.docx", "application/octet-stream")).toBe("docx")
    expect(classifyFile("x/uuid-a.pptx", null)).toBe("pptx")
    expect(classifyFile("x/uuid-a.xlsx", null)).toBe("xlsx")
  })

  it("routes code/text files (even when served as octet-stream)", () => {
    expect(classifyFile("x/uuid-main.py", "application/octet-stream")).toBe("text")
    expect(classifyFile("x/uuid-a.ts", "application/octet-stream")).toBe("text")
    expect(classifyFile("x/uuid-readme.md", "application/octet-stream")).toBe("text")
    expect(classifyFile("x/uuid-a.json", "application/json")).toBe("text")
  })

  it("routes images and audio/video to the media pipeline", () => {
    expect(classifyFile("x/uuid-a.bin", "image/png")).toBe("image")
    expect(classifyFile("x/uuid-a.bin", "audio/mpeg")).toBe("audio")
    expect(classifyFile("x/uuid-a.bin", "video/mp4")).toBe("audio")
  })

  it("returns null for unknown binaries", () => {
    expect(classifyFile("x/uuid-a.bin", "application/octet-stream")).toBeNull()
  })
})
