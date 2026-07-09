import createIntlMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

export default createIntlMiddleware(routing)

export const config = {
  // Skip API routes, static files and Next.js internals
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
}
