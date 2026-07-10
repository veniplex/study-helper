"use client"

import * as React from "react"
import { Copy, Loader2, Plus } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { createInvite, deleteInvite } from "@/app/[locale]/(admin)/admin/actions"
import { DeleteButton } from "@/components/studies/delete-button"
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

export type InviteRow = {
  id: string
  token: string
  maxUses: number
  usedCount: number
  expiresAt: Date | null
  createdAt: Date
}

export function InviteManager({ appUrl, invites }: { appUrl: string; invites: InviteRow[] }) {
  const t = useTranslations("admin.invites")
  const format = useFormatter()
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createInvite({
        maxUses: Number(form.get("maxUses") || 1),
        expiresInDays: Number(form.get("expiresInDays")) || null,
      })
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  function copyLink(token: string) {
    void navigator.clipboard.writeText(`${appUrl}/register?invite=${token}`)
    toast.success(t("copied"))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-uses">{t("maxUses")}</Label>
            <Input
              id="inv-uses"
              name="maxUses"
              type="number"
              min={1}
              max={1000}
              defaultValue={1}
              className="w-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-days">{t("expiresInDays")}</Label>
            <Input
              id="inv-days"
              name="expiresInDays"
              type="number"
              min={1}
              max={365}
              placeholder="∞"
              className="w-28"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("create")}
          </Button>
        </form>

        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => {
              const expired = inv.expiresAt != null && inv.expiresAt < new Date()
              const exhausted = inv.usedCount >= inv.maxUses
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 text-sm"
                >
                  <code className="text-xs">{inv.token.slice(0, 10)}…</code>
                  <span className="text-muted-foreground text-xs">
                    {t("uses", { used: inv.usedCount, max: inv.maxUses })}
                    {inv.expiresAt &&
                      ` · ${t("expires", { date: format.dateTime(inv.expiresAt, { dateStyle: "medium" }) })}`}
                  </span>
                  {(expired || exhausted) && (
                    <span className="text-destructive text-xs">{t("inactive")}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => copyLink(inv.token)}>
                      <Copy className="size-3.5" />
                      {t("copyLink")}
                    </Button>
                    <DeleteButton action={deleteInvite.bind(null, inv.id)} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
