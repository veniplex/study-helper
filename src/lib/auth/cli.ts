// Used ONLY by the better-auth CLI for schema generation:
//   npx @better-auth/cli generate --config src/lib/auth/cli.ts --output src/db/schema/auth.ts
// (temporarily comment out `import "server-only"` in settings.ts/email.ts if the CLI complains)
import { buildAuth } from "./index"

export const auth = buildAuth({
  registrationMode: "open",
  socialProviders: {},
  oidcProviders: [],
})
