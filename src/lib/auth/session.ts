import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
// getPathname applies the routing config's locale prefix; next-intl's own
// redirect isn't typed as `never`, so it wouldn't narrow the session below.
import { getPathname } from "@/i18n/navigation"
import { getAuth, type Session } from "./index"

export const getSession = cache(async (): Promise<Session | null> => {
  const auth = await getAuth()
  return auth.api.getSession({ headers: await headers() })
})

/** Redirects to the login page when there is no session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(getPathname({ href: "/login", locale: await getLocale() }))
  return session
}

/** Redirects to the app root when the user is not an admin. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.user.role !== "admin") redirect(getPathname({ href: "/", locale: await getLocale() }))
  return session
}
