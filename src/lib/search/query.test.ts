import { describe, expect, it } from "vitest"
import { escapeLike, likePattern } from "./query"

describe("escapeLike", () => {
  it("escapes LIKE wildcards so user input matches literally", () => {
    expect(escapeLike("50%")).toBe("50\\%")
    expect(escapeLike("a_b")).toBe("a\\_b")
    expect(escapeLike("c:\\path")).toBe("c:\\\\path")
  })

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("Analysis")).toBe("Analysis")
  })
})

describe("likePattern", () => {
  it("wraps the escaped term in wildcards", () => {
    expect(likePattern("foo")).toBe("%foo%")
    expect(likePattern("100%")).toBe("%100\\%%")
  })
})
