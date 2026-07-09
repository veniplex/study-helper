import "server-only"
import { getSetting } from "@/lib/settings"
import type { SsoOptions } from "@/components/auth/social-buttons"

export async function getSsoOptions(): Promise<SsoOptions> {
  const [social, oidc] = await Promise.all([
    getSetting("auth.socialProviders"),
    getSetting("auth.oidcProviders"),
  ])
  return {
    github: Boolean(social?.github),
    google: Boolean(social?.google),
    oidc: (oidc ?? []).map((p) => ({ providerId: p.providerId, name: p.name })),
  }
}
