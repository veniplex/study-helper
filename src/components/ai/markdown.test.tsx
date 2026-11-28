import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Markdown } from "./markdown"

// The stylesheet comes from the direct `katex` dependency while the markup is
// produced by the katex copy rehype-katex resolves. KaTeX 0.18 prefixed its
// layout classes (`base` -> `katex-base`, ...), so both must be the same
// version (package.json pins them together via `overrides.katex`), or every
// formula renders unstyled.
describe("Markdown math", () => {
  it("renders inline and display math with the classes of the bundled stylesheet", async () => {
    const { version } = (await import("katex")).default
    const html = renderToStaticMarkup(
      <Markdown>{"Inline $e^{i\\pi}+1=0$\n\n$$\n\\frac{1}{3}\n$$"}</Markdown>
    )
    expect(Number(version.split(".")[1])).toBeGreaterThanOrEqual(18)
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('class="katex-base"')
    expect(html).not.toContain('class="base"')
  })
})
