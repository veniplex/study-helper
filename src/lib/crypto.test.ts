import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decrypt, encrypt } from "./crypto"

describe("crypto", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "test-encryption-key-with-enough-entropy")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("round-trips a plaintext", () => {
    expect(decrypt(encrypt("sk-live-abc123"))).toBe("sk-live-abc123")
  })

  it("round-trips unicode and empty strings", () => {
    expect(decrypt(encrypt("Prüfung · 日本語 · 🎓"))).toBe("Prüfung · 日本語 · 🎓")
    expect(decrypt(encrypt(""))).toBe("")
  })

  it("uses a fresh IV per call, so equal plaintexts differ as ciphertext", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"))
  })

  it("rejects a tampered ciphertext via the GCM auth tag", () => {
    // encrypt() always emits the four-part "v1:iv:tag:data" form.
    const [version, iv, tag, data] = encrypt("secret").split(":")
    const flipped = Buffer.from(data!, "base64")
    flipped[0] = flipped[0]! ^ 0xff
    expect(() => decrypt(`${version}:${iv}:${tag}:${flipped.toString("base64")}`)).toThrow()
  })

  it("rejects an unknown version prefix", () => {
    const payload = encrypt("secret").replace(/^v1:/, "v2:")
    expect(() => decrypt(payload)).toThrow(/Unknown ciphertext version/)
  })

  it("rejects a truncated payload with a clear error", () => {
    expect(() => decrypt("v1:abc")).toThrow(/Malformed ciphertext/)
    expect(() => decrypt("v1")).toThrow(/Malformed ciphertext/)
  })

  it("cannot decrypt with a different key", () => {
    const payload = encrypt("secret")
    vi.stubEnv("ENCRYPTION_KEY", "a-completely-different-encryption-key")
    expect(() => decrypt(payload)).toThrow()
  })
})
