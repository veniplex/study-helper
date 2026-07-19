import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, genericOAuth, twoFactor } from "better-auth/plugins"
import { passkey } from "@better-auth/passkey"
import { and, count, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { env } from "@/lib/env"
import { sendEmail } from "@/lib/email"
import { bustSettingsCache, getSetting } from "@/lib/settings"

type DynamicAuthConfig = {
  registrationMode: "open" | "closed" | "invite"
  socialProviders: Awaited<ReturnType<typeof getSetting<"auth.socialProviders">>>
  oidcProviders: Awaited<ReturnType<typeof getSetting<"auth.oidcProviders">>>
}

function buildAuth(config: DynamicAuthConfig) {
  const social = config.socialProviders ?? {}
  const oidc = config.oidcProviders ?? []
  const rpUrl = new URL(env.APP_URL)

  // When registration is not open, a first-time social/OIDC login must NOT
  // auto-create a user (better-auth would otherwise implicitly sign them up,
  // bypassing the closed/invite gate that only covers email sign-up).
  const restrictImplicitSignup = config.registrationMode !== "open"
  const implicitSignup = restrictImplicitSignup ? { disableImplicitSignUp: true as const } : {}

  const options = {
    appName: "StudyHelper",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh the session at most once per day
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.registrationMode === "closed",
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your password",
          text: `Click the link to reset your password: ${url}`,
        })
      },
    },
    socialProviders: {
      ...(social.github ? { github: { ...social.github, ...implicitSignup } } : {}),
      ...(social.google ? { google: { ...social.google, ...implicitSignup } } : {}),
    },
    hooks: {
      // Invite mode: sign-ups require a valid invite token (enforced server-side)
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || config.registrationMode !== "invite") return
        const token = (ctx.body as { inviteToken?: string } | undefined)?.inviteToken
        if (!token) {
          throw new APIError("BAD_REQUEST", { message: "INVITE_REQUIRED" })
        }
        const row = await db.query.invite.findFirst({
          where: eq(schema.invite.token, token),
        })
        if (!row || (row.expiresAt && row.expiresAt < new Date()) || row.usedCount >= row.maxUses) {
          throw new APIError("BAD_REQUEST", { message: "INVITE_INVALID" })
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || config.registrationMode !== "invite") return
        const token = (ctx.body as { inviteToken?: string } | undefined)?.inviteToken
        if (token) {
          // Conditional increment so concurrent sign-ups can never push
          // usedCount past maxUses.
          await db
            .update(schema.invite)
            .set({ usedCount: sql`${schema.invite.usedCount} + 1` })
            .where(
              and(
                eq(schema.invite.token, token),
                sql`${schema.invite.usedCount} < ${schema.invite.maxUses}`
              )
            )
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Never decide admin here: counting users before the row is inserted
          // is racy — two concurrent first sign-ups both read 0 and both become
          // admin. Create everyone as a normal user; the `after` hook promotes
          // the first one atomically.
          before: async (user) => ({ data: { ...user, role: "user" } }),
          // Exactly-one-first-admin, race-free. `after` runs once the create
          // transaction has committed (queueAfterTransactionHook), so the new
          // row is visible here. A transaction-scoped advisory lock serializes
          // concurrent first sign-ups: the first to acquire it sees 0 admins and
          // promotes itself; the rest see 1 and no-op.
          after: async (user) => {
            await db.transaction(async (tx) => {
              await tx.execute(sql`select pg_advisory_xact_lock(hashtext('studyhelper:first-admin'))`)
              const [{ value: adminCount }] = await tx
                .select({ value: count() })
                .from(schema.user)
                .where(eq(schema.user.role, "admin"))
              if (adminCount === 0) {
                await tx
                  .update(schema.user)
                  .set({ role: "admin" })
                  .where(eq(schema.user.id, user.id))
              }
            })
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
          ...implicitSignup,
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
  // The auth instance is built from cached settings; drop those too so the
  // rebuild reads the just-written values instead of a stale 30s-TTL copy.
  bustSettingsCache()
}

// For CLI schema generation see src/lib/auth/cli.ts. Runtime code must use
// getAuth() — building an instance eagerly at import time would require env
// secrets during `next build`.
export { buildAuth }
