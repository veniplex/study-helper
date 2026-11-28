import { getAuth } from "@/lib/auth"
import { mapLegacyOAuthCallback } from "@/lib/auth/legacy-callback"

async function handler(request: Request) {
  const auth = await getAuth()
  return auth.handler(await mapLegacyOAuthCallback(request))
}

export { handler as GET, handler as POST }
