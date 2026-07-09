"use client"

import * as React from "react"
import { Fingerprint, Loader2, ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
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
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { authClient } from "@/lib/auth/client"

type Passkey = { id: string; name?: string | null; createdAt: Date }

export function SecuritySettings({
  twoFactorEnabled,
  passkeys,
}: {
  twoFactorEnabled: boolean
  passkeys: Passkey[]
}) {
  const t = useTranslations("settings.security")
  const [pending, setPending] = React.useState(false)
  const [totpUri, setTotpUri] = React.useState<string | null>(null)
  const [qrSvg, setQrSvg] = React.useState<string | null>(null)
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)
  const [is2faEnabled, setIs2faEnabled] = React.useState(twoFactorEnabled)
  const [keys, setKeys] = React.useState<Passkey[]>(passkeys)

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword: String(form.get("newPassword")),
      revokeOtherSessions: true,
    })
    setPending(false)
    if (error) toast.error(error.message)
    else {
      toast.success(t("passwordChanged"))
      ;(e.target as HTMLFormElement).reset()
    }
  }

  async function enable2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get("password"))
    setPending(true)
    const { data, error } = await authClient.twoFactor.enable({ password })
    setPending(false)
    if (error || !data) {
      toast.error(error?.message ?? "Error")
      return
    }
    setTotpUri(data.totpURI)
    setBackupCodes(data.backupCodes)
    const QRCode = (await import("qrcode")).default
    setQrSvg(await QRCode.toString(data.totpURI, { type: "svg", margin: 1, width: 200 }))
  }

  async function verify2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { error } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code")),
    })
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setIs2faEnabled(true)
    setTotpUri(null)
    setQrSvg(null)
    toast.success(t("twoFactorNowEnabled"))
  }

  async function disable2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    const { error } = await authClient.twoFactor.disable({
      password: String(form.get("password")),
    })
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setIs2faEnabled(false)
    setBackupCodes(null)
    toast.success(t("twoFactorNowDisabled"))
  }

  async function addPasskey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get("name") || "")
    setPending(true)
    const result = await authClient.passkey.addPasskey({ name: name || undefined })
    setPending(false)
    if (result?.error) {
      toast.error(result.error.message)
      return
    }
    toast.success(t("passkeyAdded"))
    const list = await authClient.passkey.listUserPasskeys()
    if (list.data) setKeys(list.data as Passkey[])
    ;(e.target as HTMLFormElement).reset()
  }

  async function deletePasskey(id: string) {
    const { error } = await authClient.passkey.deletePasskey({ id })
    if (error) {
      toast.error(error.message)
      return
    }
    setKeys((k) => k.filter((p) => p.id !== id))
    toast.success(t("passkeyDeleted"))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Change password */}
        <form onSubmit={changePassword} className="max-w-md space-y-3">
          <h3 className="font-medium">{t("changePassword")}</h3>
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">{t("newPassword")}</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {t("changePassword")}
          </Button>
        </form>

        <Separator />

        {/* Two-factor */}
        <div className="max-w-md space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{t("twoFactor")}</h3>
            <Badge variant={is2faEnabled ? "default" : "secondary"}>
              {is2faEnabled ? (
                <>
                  <ShieldCheck className="size-3" /> {t("twoFactorEnabled")}
                </>
              ) : (
                <>
                  <ShieldOff className="size-3" /> {t("twoFactorDisabled")}
                </>
              )}
            </Badge>
          </div>

          {!is2faEnabled && !totpUri && (
            <form onSubmit={enable2fa} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="enable-password">{t("passwordRequired")}</Label>
                <Input id="enable-password" name="password" type="password" required />
              </div>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("enable")}
              </Button>
            </form>
          )}

          {totpUri && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">{t("scanQr")}</p>
              {qrSvg && (
                <div
                  className="w-fit rounded-lg bg-white p-3"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
              {backupCodes && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("backupCodes")}</p>
                  <code className="bg-muted block rounded-md p-2 text-xs whitespace-pre-wrap">
                    {backupCodes.join("  ")}
                  </code>
                </div>
              )}
              <form onSubmit={verify2fa} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="verify-code">{t("verifyCode")}</Label>
                  <Input
                    id="verify-code"
                    name="code"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <Button type="submit" disabled={pending}>
                  {t("verifyCode")}
                </Button>
              </form>
            </div>
          )}

          {is2faEnabled && (
            <form onSubmit={disable2fa} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="disable-password">{t("passwordRequired")}</Label>
                <Input id="disable-password" name="password" type="password" required />
              </div>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t("disable")}
              </Button>
            </form>
          )}
        </div>

        <Separator />

        {/* Passkeys */}
        <div className="max-w-md space-y-3">
          <h3 className="font-medium">{t("passkeys")}</h3>
          {keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noPasskeys")}</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Fingerprint className="text-muted-foreground size-4" />
                    {p.name || p.id.slice(0, 8)}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => deletePasskey(p.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addPasskey} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="passkey-name">{t("passkeyName")}</Label>
              <Input id="passkey-name" name="name" />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              <Fingerprint className="size-4" />
              {t("addPasskey")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
