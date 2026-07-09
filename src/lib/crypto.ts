import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { env } from "./env"

// AES-256-GCM for secrets at rest (user AI keys, SMTP/OAuth credentials, notes).
// Key is derived from ENCRYPTION_KEY so any string of sufficient entropy works.

function key(): Buffer {
  return createHash("sha256").update(env.ENCRYPTION_KEY).digest()
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":")
  if (version !== "v1") throw new Error("Unknown ciphertext version")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8"
  )
}
