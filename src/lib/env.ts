/**
 * Dev fallbacks apply only when NODE_ENV explicitly says "development" or
 * "test". An unset NODE_ENV — a dedicated worker started from a systemd unit, a
 * cron job, `npm run worker` on a server — counts as production: a missing
 * DATABASE_URL then fails loudly instead of silently pointing at a local dev
 * database, and secrets never quietly fall back to the published dev values.
 */
function isDevLike(): boolean {
  const mode = process.env.NODE_ENV
  return mode === "development" || mode === "test"
}

function required(name: string, devFallback?: string): string {
  const value = process.env[name] ?? (isDevLike() ? devFallback : undefined)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const warned = new Set<string>()

/**
 * Like {@link required}, but rejects the placeholder shipped in `.env.example`.
 * That value is public, so an instance still running it has no protection at
 * all — and unlike a weak-but-unique secret, nobody chose it deliberately.
 *
 * Length is only warned about, never fatal: ENCRYPTION_KEY cannot be rotated
 * without losing every stored secret, so refusing to boot would strand a
 * running instance rather than protect it.
 */
function secret(name: string, devFallback?: string): string {
  const value = required(name, devFallback)
  if (!isDevLike()) {
    if (value.trim().toLowerCase() === "change-me") {
      throw new Error(
        `${name} is still the example placeholder. Generate one with: openssl rand -base64 32`
      )
    }
    if (value.length < 32 && !warned.has(name)) {
      warned.add(name)
      console.warn(
        `[env] ${name} is shorter than 32 characters — generate a stronger one with: openssl rand -base64 32`
      )
    }
  }
  return value
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL", "postgres://study:study@localhost:5432/study")
  },
  get APP_URL() {
    return required("APP_URL", "http://localhost:3000")
  },
  get BETTER_AUTH_SECRET() {
    return secret("BETTER_AUTH_SECRET", "dev-only-secret")
  },
  get ENCRYPTION_KEY() {
    return secret("ENCRYPTION_KEY", "dev-only-encryption-key")
  },
}
