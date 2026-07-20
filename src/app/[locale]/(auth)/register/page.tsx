import { redirect } from "next/navigation"
import { count } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { db } from "@/db"
import { user } from "@/db/schema"
import { getSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { getSsoOptions } from "@/lib/auth/sso-options"
import { RegisterForm } from "@/components/auth/register-form"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const session = await getSession()
  if (session) redirect("/")

  const [{ invite }, registrationMode] = await Promise.all([
    searchParams,
    getSetting("auth.registrationMode").then((m) => m ?? "open"),
  ])
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

  const [sso, userCountRows] = await Promise.all([
    getSsoOptions(),
    db.select({ value: count() }).from(user),
  ])
  // count() over the whole table always yields exactly one row.
  const userCount = userCountRows[0]!.value
  return (
    <RegisterForm
      sso={sso}
      inviteMode={registrationMode === "invite"}
      inviteToken={invite}
      isFirstAccount={userCount === 0}
    />
  )
}
