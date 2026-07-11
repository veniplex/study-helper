"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  saveOidcProviders,
  saveRegistrationMode,
  saveSocialProviders,
} from "@/app/[locale]/(app)/admin/actions"

type OidcProvider = {
  providerId: string
  name: string
  discoveryUrl: string
  clientId: string
  clientSecret: string
  scopes: string[]
}

type SocialConfig = {
  github?: { clientId: string; clientSecret: string }
  google?: { clientId: string; clientSecret: string }
}

export function AuthSettingsForm({
  appUrl,
  initial,
}: {
  appUrl: string
  initial: {
    registrationMode: "open" | "closed" | "invite"
    social: SocialConfig
    oidc: OidcProvider[]
  }
}) {
  const t = useTranslations("admin.auth")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)
  const [registrationMode, setRegistrationMode] = React.useState(initial.registrationMode)
  const [github, setGithub] = React.useState(initial.social.github ?? null)
  const [google, setGoogle] = React.useState(initial.social.google ?? null)
  const [oidc, setOidc] = React.useState<OidcProvider[]>(initial.oidc)

  async function save() {
    setPending(true)
    try {
      await saveRegistrationMode(registrationMode)
      await saveSocialProviders({
        ...(github?.clientId && github?.clientSecret ? { github } : {}),
        ...(google?.clientId && google?.clientSecret ? { google } : {}),
      })
      await saveOidcProviders(
        oidc.filter((p) => p.providerId && p.discoveryUrl && p.clientId && p.clientSecret)
      )
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  function updateOidc(index: number, patch: Partial<OidcProvider>) {
    setOidc((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("registrationMode")}</Label>
            <Select
              value={registrationMode}
              onValueChange={(v) => setRegistrationMode(v as "open" | "closed" | "invite")}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue>
                  {registrationMode === "open"
                    ? t("registrationOpen")
                    : registrationMode === "invite"
                      ? t("registrationInvite")
                      : t("registrationClosed")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("registrationOpen")}</SelectItem>
                <SelectItem value="invite">{t("registrationInvite")}</SelectItem>
                <SelectItem value="closed">{t("registrationClosed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {(
            [
              ["github", github, setGithub],
              ["google", google, setGoogle],
            ] as const
          ).map(([key, value, setValue]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">{t(key)}</Label>
                <Switch
                  checked={value != null}
                  onCheckedChange={(on) =>
                    setValue(on ? { clientId: "", clientSecret: "" } : null)
                  }
                />
              </div>
              {value != null && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${key}-id`}>{t("clientId")}</Label>
                    <Input
                      id={`${key}-id`}
                      value={value.clientId}
                      onChange={(e) => setValue({ ...value, clientId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${key}-secret`}>{t("clientSecret")}</Label>
                    <Input
                      id={`${key}-secret`}
                      type="password"
                      value={value.clientSecret}
                      onChange={(e) => setValue({ ...value, clientSecret: e.target.value })}
                    />
                  </div>
                  <p className="text-muted-foreground col-span-full text-xs">
                    {t("redirectHint")}: <code>{appUrl}/api/auth/callback/{key}</code>
                  </p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("oidcTitle")}</CardTitle>
          <CardDescription>{t("oidcDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {oidc.map((p, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("providerId")}</Label>
                  <Input
                    value={p.providerId}
                    placeholder="keycloak"
                    onChange={(e) =>
                      updateOidc(i, {
                        providerId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("displayName")}</Label>
                  <Input
                    value={p.name}
                    placeholder="Keycloak"
                    onChange={(e) => updateOidc(i, { name: e.target.value })}
                  />
                </div>
                <div className="col-span-full space-y-1.5">
                  <Label>{t("discoveryUrl")}</Label>
                  <Input
                    value={p.discoveryUrl}
                    placeholder="https://sso.example.com/realms/main/.well-known/openid-configuration"
                    onChange={(e) => updateOidc(i, { discoveryUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("clientId")}</Label>
                  <Input
                    value={p.clientId}
                    onChange={(e) => updateOidc(i, { clientId: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("clientSecret")}</Label>
                  <Input
                    type="password"
                    value={p.clientSecret}
                    onChange={(e) => updateOidc(i, { clientSecret: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  {t("redirectHint")}:{" "}
                  <code>
                    {appUrl}/api/auth/oauth2/callback/{p.providerId || "…"}
                  </code>
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setOidc((list) => list.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" />
                  {t("removeProvider")}
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setOidc((list) => [
                ...list,
                {
                  providerId: "",
                  name: "",
                  discoveryUrl: "",
                  clientId: "",
                  clientSecret: "",
                  scopes: ["openid", "profile", "email"],
                },
              ])
            }
          >
            <Plus className="size-4" />
            {t("addProvider")}
          </Button>
        </CardContent>
        <CardFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {tCommon("save")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
