import { describe, expect, it } from "vitest"
import de from "../../messages/de.json"
import en from "../../messages/en.json"
import { ACTION_ERROR_CODES, extractActionErrorCode } from "./action-errors"

/** Collects every dotted leaf key path of a nested message object. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k)
  )
}

describe("action error codes", () => {
  it("every ActionErrorCode has an errors.<code> key in de and en", () => {
    const deErrors = de.errors as Record<string, string>
    const enErrors = en.errors as Record<string, string>
    for (const code of ACTION_ERROR_CODES) {
      expect(deErrors[code], `missing de errors.${code}`).toBeTruthy()
      expect(enErrors[code], `missing en errors.${code}`).toBeTruthy()
    }
  })

  it("errors namespaces contain no codes beyond the ActionErrorCode union", () => {
    const known = new Set<string>(ACTION_ERROR_CODES)
    for (const key of Object.keys(de.errors)) expect(known.has(key), `de errors.${key}`).toBe(true)
    for (const key of Object.keys(en.errors)) expect(known.has(key), `en errors.${key}`).toBe(true)
  })

  it("extractActionErrorCode parses ERR:<code> tokens and ignores everything else", () => {
    expect(extractActionErrorCode(new Error("ERR:GOAL_MAX_ATTEMPTS"))).toBe("GOAL_MAX_ATTEMPTS")
    expect(extractActionErrorCode(new Error("ERR:LIMIT_EXCEEDED logged detail"))).toBe(
      "LIMIT_EXCEEDED"
    )
    expect(extractActionErrorCode(new Error("ERR:NOT_A_REAL_CODE"))).toBeNull()
    expect(extractActionErrorCode(new Error("Some raw provider string"))).toBeNull()
    expect(extractActionErrorCode("plain string")).toBeNull()
  })
})

describe("i18n de/en parity", () => {
  it("de and en share an identical key structure", () => {
    const deKeys = keyPaths(de).sort()
    const enKeys = keyPaths(en).sort()
    const onlyDe = deKeys.filter((k) => !enKeys.includes(k))
    const onlyEn = enKeys.filter((k) => !deKeys.includes(k))
    expect(onlyDe, "keys only in de").toEqual([])
    expect(onlyEn, "keys only in en").toEqual([])
  })
})
