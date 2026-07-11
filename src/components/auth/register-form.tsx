"use client"

import * as React from "react"
import { Loader2, Shield } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { SocialButtons, type SsoOptions } from "./social-buttons"

/** 0–3 strength score from length + character variety. */
function passwordScore(pw: string): number {
  if (pw.length < 8) return 0
  let variety = 0
  if (/[a-z]/.test(pw)) variety++
  if (/[A-Z]/.test(pw)) variety++
  if (/[0-9]/.test(pw)) variety++
  if (/[^a-zA-Z0-9]/.test(pw)) variety++
  if (pw.length >= 12 && variety >= 3) return 3
  if (pw.length >= 10 && variety >= 2) return 2
  return 1
}

export function RegisterForm({
  sso,
  inviteMode = false,
  inviteToken,
  isFirstAccount = false,
}: {
  sso: SsoOptions
  inviteMode?: boolean
  inviteToken?: string
  /** True when no user exists yet — this account becomes the admin. */
  isFirstAccount?: boolean
}) {
  const t = useTranslations("auth.register")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const score = passwordScore(password)
  const mismatch = confirm.length > 0 && confirm !== password

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error(t("passwordMismatch"))
      return
    }
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      // Extra field validated by a server-side better-auth hook in invite mode
      ...(inviteMode ? { inviteToken: String(form.get("inviteToken") || "") } : {}),
    } as Parameters<typeof authClient.signUp.email>[0])
    setPending(false)
    if (error) {
      toast.error(error.message ?? t("error"))
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
        {isFirstAccount && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <Shield className="text-primary mt-0.5 size-4 shrink-0" />
            <p className="text-muted-foreground">{t("firstAccountHint")}</p>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          {inviteMode && (
            <div className="space-y-2">
              <Label htmlFor="inviteToken">{t("inviteToken")}</Label>
              <Input
                id="inviteToken"
                name="inviteToken"
                defaultValue={inviteToken ?? ""}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {password.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full transition-all",
                      score <= 1 ? "bg-destructive" : score === 2 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${(score / 3) * 100}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-14 text-right text-xs">
                  {t(`strength_${score}`)}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("passwordConfirm")}</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
              required
            />
            {mismatch && <p className="text-destructive text-xs">{t("passwordMismatch")}</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pending || mismatch || password.length < 8}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </form>
        <div className="mt-4">
          <SocialButtons options={sso} callbackURL="/" />
        </div>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">{t("hasAccount")}</span>
        <Link href="/login" className="ml-1.5 font-medium underline-offset-4 hover:underline">
          {t("login")}
        </Link>
      </CardFooter>
    </Card>
  )
}
