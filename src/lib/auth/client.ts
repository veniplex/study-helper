import { createAuthClient } from "better-auth/react"
import { adminClient, genericOAuthClient, twoFactorClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

export const authClient = createAuthClient({
  plugins: [adminClient(), twoFactorClient(), passkeyClient(), genericOAuthClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
