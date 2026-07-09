"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authClient } from "@/lib/auth/client"

export function TwoFactorForm() {
  const t = useTranslations("auth.twoFactor")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [trustDevice, setTrustDevice] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { error } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code")),
      trustDevice,
    })
    setPending(false)
    if (error) {
      toast.error(t("error"))
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
            <Label htmlFor="code">{t("code")}</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="trust" checked={trustDevice} onCheckedChange={setTrustDevice} />
            <Label htmlFor="trust">{t("trustDevice")}</Label>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
