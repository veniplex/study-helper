import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { getSsoOptions } from "@/lib/auth/sso-options"
import { LoginForm } from "@/components/auth/login-form"

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect("/")
  const sso = await getSsoOptions()
  return <LoginForm sso={sso} />
}
