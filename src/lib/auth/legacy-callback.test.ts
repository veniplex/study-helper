import { describe, expect, it } from "vitest"
import { mapLegacyOAuthCallback } from "./legacy-callback"

describe("mapLegacyOAuthCallback", () => {
  it("maps the pre-1.7 generic OAuth callback onto /api/auth/callback/:id", async () => {
    const req = new Request("https://study.example.com/api/auth/oauth2/callback/keycloak?code=c&state=s", {
      headers: { cookie: "a=b" },
    })
    const mapped = await mapLegacyOAuthCallback(req)
    expect(mapped.url).toBe("https://study.example.com/api/auth/callback/keycloak?code=c&state=s")
    expect(mapped.method).toBe("GET")
    expect(mapped.headers.get("cookie")).toBe("a=b")
  })

  it("keeps the body of form_post callbacks", async () => {
    const req = new Request("https://study.example.com/api/auth/oauth2/callback/kc", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=c&state=s",
    })
    const mapped = await mapLegacyOAuthCallback(req)
    expect(new URL(mapped.url).pathname).toBe("/api/auth/callback/kc")
    expect(mapped.method).toBe("POST")
    expect(await mapped.text()).toBe("code=c&state=s")
  })

  it("passes every other auth request through untouched", async () => {
    const req = new Request("https://study.example.com/api/auth/callback/github?code=c")
    expect(await mapLegacyOAuthCallback(req)).toBe(req)
  })
})
