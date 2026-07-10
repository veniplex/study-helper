"use client"

import * as React from "react"
import { BellRing, Loader2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveNotificationPrefs } from "@/app/[locale]/(app)/settings/actions"

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function NotificationSettings({
  initial,
}: {
  initial: { emailReminders: boolean; pushReminders: boolean }
}) {
  const t = useTranslations("settings.notifications")
  const [emailReminders, setEmailReminders] = React.useState(initial.emailReminders)
  const [pushReminders, setPushReminders] = React.useState(initial.pushReminders)
  const [pushSubscribed, setPushSubscribed] = React.useState<boolean | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    void fetch("/api/push")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPushSubscribed(Boolean(data?.subscribed)))
      .catch(() => setPushSubscribed(false))
  }, [])

  async function savePrefs(email: boolean, push: boolean) {
    try {
      await saveNotificationPrefs({ emailReminders: email, pushReminders: push })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function enablePush() {
    setPending(true)
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error(t("unsupported"))
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        toast.error(t("denied"))
        return
      }
      const registration = await navigator.serviceWorker.ready
      const { publicKey } = await fetch("/api/push").then((r) => r.json())
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error(await res.text())
      setPushSubscribed(true)
      toast.success(t("pushEnabled"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  async function disablePush() {
    setPending(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setPushSubscribed(false)
      toast.success(t("pushDisabled"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="n-email">{t("email")}</Label>
          <Switch
            id="n-email"
            checked={emailReminders}
            onCheckedChange={(on) => {
              setEmailReminders(on)
              void savePrefs(on, pushReminders)
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="n-push">{t("push")}</Label>
          <Switch
            id="n-push"
            checked={pushReminders}
            onCheckedChange={(on) => {
              setPushReminders(on)
              void savePrefs(emailReminders, on)
            }}
          />
        </div>
        <div className="border-t pt-3">
          {pushSubscribed === null ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : pushSubscribed ? (
            <Button variant="outline" size="sm" onClick={disablePush} disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {t("unsubscribe")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={enablePush} disabled={pending}>
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BellRing className="size-3.5" />
              )}
              {t("subscribe")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
