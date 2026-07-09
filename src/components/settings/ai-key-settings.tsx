"use client"

import * as React from "react"
import { KeyRound, Loader2, Trash2 } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { deleteUserAiKey, saveUserAiKey } from "@/app/[locale]/(app)/settings/actions"

export function AiKeySettings({
  providers,
}: {
  providers: { id: string; name: string; hasUserKey: boolean }[]
}) {
  const t = useTranslations("settings.aiKeys")
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})

  if (providers.length === 0) return null

  async function save(providerId: string) {
    const apiKey = drafts[providerId]?.trim()
    if (!apiKey) return
    setPending(providerId)
    try {
      await saveUserAiKey({ providerId, apiKey })
      setDrafts((d) => ({ ...d, [providerId]: "" }))
      toast.success(t("saved"))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(null)
    }
  }

  async function remove(providerId: string) {
    setPending(providerId)
    try {
      await deleteUserAiKey(providerId)
      toast.success(t("deleted"))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {providers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-32 items-center gap-2 text-sm font-medium">
              {p.name}
              {p.hasUserKey && (
                <Badge variant="secondary">
                  <KeyRound className="size-3" />
                  {t("active")}
                </Badge>
              )}
            </span>
            <Input
              type="password"
              placeholder={t("placeholder")}
              value={drafts[p.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
              className="max-w-xs flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending === p.id || !drafts[p.id]?.trim()}
              onClick={() => save(p.id)}
            >
              {pending === p.id && <Loader2 className="size-3.5 animate-spin" />}
              {t("save")}
            </Button>
            {p.hasUserKey && (
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending === p.id}
                onClick={() => remove(p.id)}
              >
                <Trash2 className="text-destructive size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
