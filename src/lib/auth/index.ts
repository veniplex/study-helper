import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, genericOAuth, twoFactor } from "better-auth/plugins"
import { passkey } from "@better-auth/passkey"
import { count } from "drizzle-orm"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { env } from "@/lib/env"
import { sendEmail } from "@/lib/email"
import { getSetting } from "@/lib/settings"

type DynamicAuthConfig = {
  registrationMode: "open" | "closed"
  socialProviders: Awaited<ReturnType<typeof getSetting<"auth.socialProviders">>>
  oidcProviders: Awaited<ReturnType<typeof getSetting<"auth.oidcProviders">>>
}

function buildAuth(config: DynamicAuthConfig) {
  const social = config.socialProviders ?? {}
  const oidc = config.oidcProviders ?? []
  const rpUrl = new URL(env.APP_URL)

  const options = {
    appName: "StudyHelper",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.registrationMode === "closed",
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your password",
          text: `Click the link to reset your password: ${url}`,
        })
      },
    },
    socialProviders: {
      ...(social.github ? { github: social.github } : {}),
      ...(social.google ? { google: social.google } : {}),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // First user becomes admin automatically
            const [{ value: userCount }] = await db.select({ value: count() }).from(schema.user)
            return { data: { ...user, role: userCount === 0 ? "admin" : "user" } }
          },
        },
      },
    },
    plugins: [
      admin(),
      twoFactor(),
      passkey({
        rpID: rpUrl.hostname,
        rpName: "StudyHelper",
        origin: env.APP_URL,
      }),
      genericOAuth({
        config: oidc.map((p) => ({
          providerId: p.providerId,
          discoveryUrl: p.discoveryUrl,
          clientId: p.clientId,
          clientSecret: p.clientSecret,
          scopes: p.scopes,
        })),
      }),
      nextCookies(), // must be last
    ],
  } satisfies BetterAuthOptions

  return betterAuth(options)
}

export type Auth = ReturnType<typeof buildAuth>
export type Session = Auth["$Infer"]["Session"]

// The auth instance depends on admin-panel settings (OIDC providers, social
// logins, registration mode), so it is built lazily and rebuilt when an admin
// changes those settings (see bustAuthCache).
const globalForAuth = globalThis as unknown as { authInstance?: Promise<Auth> }

export function getAuth(): Promise<Auth> {
  if (!globalForAuth.authInstance) {
    globalForAuth.authInstance = (async () => {
      const [registrationMode, socialProviders, oidcProviders] = await Promise.all([
        getSetting("auth.registrationMode"),
        getSetting("auth.socialProviders"),
        getSetting("auth.oidcProviders"),
      ])
      return buildAuth({
        registrationMode: registrationMode ?? "open",
        socialProviders,
        oidcProviders,
      })
    })()
  }
  return globalForAuth.authInstance
}

/** Call after changing auth-related settings so the next request picks them up. */
export function bustAuthCache(): void {
  globalForAuth.authInstance = undefined
}

// For CLI schema generation see src/lib/auth/cli.ts. Runtime code must use
// getAuth() — building an instance eagerly at import time would require env
// secrets during `next build`.
export { buildAuth }
