"use client"

import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { authClient } from "@/lib/auth/client"

export type SsoOptions = {
  github: boolean
  google: boolean
  oidc: { providerId: string; name: string }[]
}

export function SocialButtons({ options, callbackURL }: { options: SsoOptions; callbackURL: string }) {
  const t = useTranslations("auth.login")
  const hasAny = options.github || options.google || options.oidc.length > 0
  if (!hasAny) return null

  async function social(provider: "github" | "google") {
    const { error } = await authClient.signIn.social({ provider, callbackURL })
    if (error) toast.error(error.message)
  }

  async function oauth2(providerId: string) {
    const { error } = await authClient.signIn.oauth2({ providerId, callbackURL })
    if (error) toast.error(error.message)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{t("orContinueWith")}</span>
        <Separator className="flex-1" />
      </div>
      <div className="grid gap-2">
        {options.github && (
          <Button variant="outline" type="button" onClick={() => social("github")}>
            GitHub
          </Button>
        )}
        {options.google && (
          <Button variant="outline" type="button" onClick={() => social("google")}>
            Google
          </Button>
        )}
        {options.oidc.map((p) => (
          <Button
            key={p.providerId}
            variant="outline"
            type="button"
            onClick={() => oauth2(p.providerId)}
          >
            {p.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
