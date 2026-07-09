import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { getSsoOptions } from "@/lib/auth/sso-options"
import { RegisterForm } from "@/components/auth/register-form"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function RegisterPage() {
  const session = await getSession()
  if (session) redirect("/")

  const registrationMode = (await getSetting("auth.registrationMode")) ?? "open"
  if (registrationMode === "closed") {
    const t = await getTranslations("auth.register")
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("closed")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sso = await getSsoOptions()
  return <RegisterForm sso={sso} />
}
