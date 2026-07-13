import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { extractPptxText, extractXlsxText } from "./office"

describe("extractPptxText", () => {
  it("extracts slide text in order and joins slides", () => {
    const slide = (t: string) =>
      strToU8(
        `<?xml version="1.0"?><p:sld xmlns:a="x"><a:t>${t}</a:t></p:sld>`
      )
    const buf = zipSync({
      "ppt/slides/slide2.xml": slide("Second"),
      "ppt/slides/slide1.xml": slide("First"),
      "ppt/other.xml": strToU8("<a:t>ignore</a:t>"),
    })
    expect(extractPptxText(buf)).toBe("First\n\nSecond")
  })

  it("decodes xml entities", () => {
    const buf = zipSync({
      "ppt/slides/slide1.xml": strToU8("<a:t>a &amp; b &lt;c&gt;</a:t>"),
    })
    expect(extractPptxText(buf)).toBe("a & b <c>")
  })
})

describe("extractXlsxText", () => {
  it("extracts shared strings", () => {
    const buf = zipSync({
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Hello</t></si><si><t>World</t></si></sst>"),
    })
    expect(extractXlsxText(buf)).toBe("Hello World")
  })
})
