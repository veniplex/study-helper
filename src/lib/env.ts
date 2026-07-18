function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  get DATABASE_URL() {
    return required(
      "DATABASE_URL",
      process.env.NODE_ENV === "production"
        ? undefined
        : "postgres://study:study@localhost:5432/study"
    )
  },
  get APP_URL() {
    return required(
      "APP_URL",
      process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"
    )
  },
  get BETTER_AUTH_SECRET() {
    return required(
      "BETTER_AUTH_SECRET",
      process.env.NODE_ENV === "production" ? undefined : "dev-only-secret"
    )
  },
  get ENCRYPTION_KEY() {
    return required(
      "ENCRYPTION_KEY",
      process.env.NODE_ENV === "production" ? undefined : "dev-only-encryption-key"
    )
  },
}
