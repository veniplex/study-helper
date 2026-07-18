"use client"

import * as React from "react"
import { Fingerprint, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth/client"
import { SocialButtons, type SsoOptions } from "./social-buttons"

export function LoginForm({ sso }: { sso: SsoOptions }) {
  const t = useTranslations("auth.login")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) {
      // Differentiate the actionable causes; anything else stays generic so
      // credentials-vs-account-existence is not leaked.
      if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED") {
        toast.error(t("errorUnverified"))
      } else if (error.status === 429) {
        toast.error(t("errorRateLimit"))
      } else {
        toast.error(t("error"))
      }
      return
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push("/two-factor")
      return
    }
    router.push("/")
    router.refresh()
  }

  async function onPasskey() {
    const result = await authClient.signIn.passkey()
    if (result?.error) {
      toast.error(t("errorPasskey"))
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email webauthn" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password webauthn"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </form>
        <div className="mt-3 grid gap-2">
          <Button variant="outline" type="button" className="w-full" onClick={onPasskey}>
            <Fingerprint className="size-4" />
            {t("passkey")}
          </Button>
        </div>
        <div className="mt-4">
          <SocialButtons options={sso} callbackURL="/" />
        </div>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">{t("noAccount")}</span>
        <Link href="/register" className="ml-1.5 font-medium underline-offset-4 hover:underline">
          {t("register")}
        </Link>
      </CardFooter>
    </Card>
  )
}
