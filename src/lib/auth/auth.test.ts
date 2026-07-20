import { beforeEach, describe, expect, it, vi } from "vitest"

// buildAuth is the security-critical wiring of the whole app: it decides whether
// a stranger can create an account. Rather than booting better-auth against a
// database, `betterAuth` is stubbed to hand back the options object it was given
// so the resulting configuration can be asserted directly. The plugins are
// stubbed for the same reason — genericOAuth is kept inspectable because the
// OIDC providers carry the implicit-signup flag.
vi.mock("server-only", () => ({}))

vi.mock("better-auth", () => ({
  betterAuth: (options: unknown) => ({ options }),
}))
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }))
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({ id: "next-cookies" }) }))
vi.mock("better-auth/plugins", () => ({
  admin: () => ({ id: "admin" }),
  twoFactor: () => ({ id: "two-factor" }),
  genericOAuth: (config: unknown) => ({ id: "generic-oauth", config }),
}))
vi.mock("@better-auth/passkey", () => ({ passkey: () => ({ id: "passkey" }) }))
// Keep the real APIError (the invite hook's failure mode is asserted through it)
// but unwrap createAuthMiddleware so the hook can be called with a fake ctx.
vi.mock("better-auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/api")>()
  return { ...actual, createAuthMiddleware: (fn: unknown) => fn }
})

const inviteFindFirstMock = vi.fn()
vi.mock("@/db", () => ({
  db: {
    query: { invite: { findFirst: (...args: unknown[]) => inviteFindFirstMock(...args) } },
  },
}))
vi.mock("@/db/schema", () => ({
  invite: { token: "token", usedCount: "usedCount", maxUses: "maxUses" },
  user: { id: "id", role: "role" },
}))
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://study.example.com", BETTER_AUTH_SECRET: "test-secret" },
}))
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(), bustSettingsCache: vi.fn() }))

import { APIError } from "better-auth/api"
import { buildAuth } from "./index"

type ProviderOptions = { clientId: string; clientSecret: string; disableImplicitSignUp?: boolean }
type OidcConfig = { providerId: string; disableImplicitSignUp?: boolean }

type Options = {
  emailAndPassword: { enabled: boolean; disableSignUp: boolean; minPasswordLength: number }
  socialProviders: Record<string, ProviderOptions | undefined>
  session: { expiresIn: number; updateAge: number }
  rateLimit: { enabled: boolean; window: number; max: number }
  plugins: Array<{ id: string; config?: { config: OidcConfig[] } }>
  hooks: { before: (ctx: unknown) => Promise<void> }
}

const social = {
  github: { clientId: "gh-id", clientSecret: "gh-secret" },
  google: { clientId: "goog-id", clientSecret: "goog-secret" },
}

const oidc = [
  {
    providerId: "keycloak",
    name: "Keycloak",
    discoveryUrl: "https://idp.example.com/.well-known/openid-configuration",
    clientId: "kc-id",
    clientSecret: "kc-secret",
    scopes: ["openid", "profile", "email"],
  },
]

function optionsFor(registrationMode: "open" | "closed" | "invite"): Options {
  const auth = buildAuth({ registrationMode, socialProviders: social, oidcProviders: oidc })
  return (auth as unknown as { options: Options }).options
}

function oidcConfigs(options: Options): OidcConfig[] {
  const plugin = options.plugins.find((p) => p.id === "generic-oauth")
  return plugin?.config?.config ?? []
}

describe("buildAuth registration gating", () => {
  it("closed mode disables email sign-up and implicit social/OIDC sign-up", () => {
    const options = optionsFor("closed")

    expect(options.emailAndPassword.disableSignUp).toBe(true)
    expect(options.socialProviders.github?.disableImplicitSignUp).toBe(true)
    expect(options.socialProviders.google?.disableImplicitSignUp).toBe(true)
    expect(oidcConfigs(options)).toHaveLength(1)
    expect(oidcConfigs(options)[0].disableImplicitSignUp).toBe(true)
  })

  it("invite mode disables implicit social/OIDC sign-up so the invite gate cannot be bypassed", () => {
    const options = optionsFor("invite")

    // Email sign-up stays enabled — it is gated by the invite hook, not by the
    // better-auth flag.
    expect(options.emailAndPassword.disableSignUp).toBe(false)
    expect(options.socialProviders.github?.disableImplicitSignUp).toBe(true)
    expect(options.socialProviders.google?.disableImplicitSignUp).toBe(true)
    expect(oidcConfigs(options)[0].disableImplicitSignUp).toBe(true)
  })

  it("open mode leaves sign-up unrestricted", () => {
    const options = optionsFor("open")

    expect(options.emailAndPassword.enabled).toBe(true)
    expect(options.emailAndPassword.disableSignUp).toBe(false)
    expect(options.socialProviders.github?.disableImplicitSignUp).toBeUndefined()
    expect(options.socialProviders.google?.disableImplicitSignUp).toBeUndefined()
    expect(oidcConfigs(options)[0].disableImplicitSignUp).toBeUndefined()
  })

  it("only configures the social providers that are actually set up", () => {
    const auth = buildAuth({
      registrationMode: "closed",
      socialProviders: { github: { clientId: "gh-id", clientSecret: "gh-secret" } },
      oidcProviders: [],
    })
    const options = (auth as unknown as { options: Options }).options

    expect(Object.keys(options.socialProviders)).toEqual(["github"])
    expect(oidcConfigs(options)).toEqual([])
  })
})

describe("buildAuth hardening defaults", () => {
  it("sets an explicit rate limit", () => {
    const { rateLimit } = optionsFor("open")

    expect(rateLimit.enabled).toBe(true)
    expect(rateLimit.window).toBeGreaterThan(0)
    expect(rateLimit.max).toBeGreaterThan(0)
  })

  it("sets an explicit session expiry that is refreshed less often than it lasts", () => {
    const { session } = optionsFor("open")

    expect(session.expiresIn).toBe(60 * 60 * 24 * 7)
    expect(session.updateAge).toBeGreaterThan(0)
    expect(session.updateAge).toBeLessThan(session.expiresIn)
  })

  it("keeps nextCookies as the last plugin", () => {
    const { plugins } = optionsFor("open")

    expect(plugins.at(-1)?.id).toBe("next-cookies")
  })
})

describe("invite sign-up hook", () => {
  const ctx = (body: Record<string, unknown> | undefined, path = "/sign-up/email") => ({
    path,
    body,
  })

  beforeEach(() => {
    inviteFindFirstMock.mockReset()
  })

  it("rejects an email sign-up without an invite token", async () => {
    const { hooks } = optionsFor("invite")

    await expect(hooks.before(ctx({}))).rejects.toBeInstanceOf(APIError)
    await expect(hooks.before(ctx({}))).rejects.toMatchObject({ message: "INVITE_REQUIRED" })
    expect(inviteFindFirstMock).not.toHaveBeenCalled()
  })

  it("rejects an unknown invite token", async () => {
    const { hooks } = optionsFor("invite")
    inviteFindFirstMock.mockResolvedValue(undefined)

    await expect(hooks.before(ctx({ inviteToken: "nope" }))).rejects.toMatchObject({
      message: "INVITE_INVALID",
    })
  })

  it("rejects an expired invite token", async () => {
    const { hooks } = optionsFor("invite")
    inviteFindFirstMock.mockResolvedValue({
      token: "t",
      expiresAt: new Date(Date.now() - 1000),
      usedCount: 0,
      maxUses: 5,
    })

    await expect(hooks.before(ctx({ inviteToken: "t" }))).rejects.toMatchObject({
      message: "INVITE_INVALID",
    })
  })

  it("rejects an invite token whose uses are exhausted", async () => {
    const { hooks } = optionsFor("invite")
    inviteFindFirstMock.mockResolvedValue({
      token: "t",
      expiresAt: null,
      usedCount: 3,
      maxUses: 3,
    })

    await expect(hooks.before(ctx({ inviteToken: "t" }))).rejects.toMatchObject({
      message: "INVITE_INVALID",
    })
  })

  it("lets a valid invite token through", async () => {
    const { hooks } = optionsFor("invite")
    inviteFindFirstMock.mockResolvedValue({
      token: "t",
      expiresAt: new Date(Date.now() + 60_000),
      usedCount: 1,
      maxUses: 3,
    })

    await expect(hooks.before(ctx({ inviteToken: "t" }))).resolves.toBeUndefined()
  })

  it("ignores requests that are not an email sign-up", async () => {
    const { hooks } = optionsFor("invite")

    await expect(hooks.before(ctx({}, "/sign-in/email"))).resolves.toBeUndefined()
    expect(inviteFindFirstMock).not.toHaveBeenCalled()
  })

  it("does not require an invite when registration is open", async () => {
    const { hooks } = optionsFor("open")

    await expect(hooks.before(ctx({}))).resolves.toBeUndefined()
    expect(inviteFindFirstMock).not.toHaveBeenCalled()
  })
})
