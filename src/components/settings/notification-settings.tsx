"use client"

import * as React from "react"
import { BellRing, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { saveNotificationPrefs } from "@/app/[locale]/(app)/settings/actions"

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * navigator.serviceWorker.ready never settles when no service worker manages
 * the page (e.g. registration failed) — race it against a timeout so the push
 * buttons can't hang forever.
 */
async function serviceWorkerReady(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("sw-unavailable")), timeoutMs)
    ),
  ])
}

export type NotificationChannelsState = {
  events: { email: boolean; push: boolean }
  assignments: { email: boolean; push: boolean }
  dailyPlan: { email: boolean; push: boolean }
}

const CATEGORIES = ["events", "assignments", "dailyPlan"] as const

export function NotificationSettings({
  initial,
  email,
}: {
  initial: NotificationChannelsState
  /** Account email address the reminders are sent to. */
  email: string
}) {
  const t = useTranslations("settings.notifications")
  const [channels, setChannels] = React.useState(initial)
  const [pushSubscribed, setPushSubscribed] = React.useState<boolean | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    void fetch("/api/push")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPushSubscribed(Boolean(data?.subscribed)))
      .catch(() => setPushSubscribed(false))
  }, [])

  function toggle(category: (typeof CATEGORIES)[number], channel: "email" | "push", on: boolean) {
    const previous = channels
    const next = {
      ...channels,
      [category]: { ...channels[category], [channel]: on },
    }
    setChannels(next)
    saveNotificationPrefs(next).catch(() => {
      // Roll the optimistic switch back so the UI matches the server state.
      setChannels(previous)
      toast.error(t("saveFailed"))
    })
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
      const registration = await serviceWorkerReady()
      const { publicKey } = await fetch("/api/push").then((r) => r.json())
      let subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      let res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (res.status === 409) {
        // The browser subscription still belongs to another account (shared
        // device). Drop it and subscribe fresh — that yields a new endpoint.
        await subscription.unsubscribe()
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        })
        res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        })
      }
      if (!res.ok) throw new Error(await res.text())
      setPushSubscribed(true)
      toast.success(t("pushEnabled"))
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "sw-unavailable"
          ? t("swUnavailable")
          : error instanceof Error
            ? error.message
            : String(error)
      )
    } finally {
      setPending(false)
    }
  }

  async function disablePush() {
    setPending(true)
    try {
      const registration = await serviceWorkerReady()
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
      toast.error(
        error instanceof Error && error.message === "sw-unavailable"
          ? t("swUnavailable")
          : error instanceof Error
            ? error.message
            : String(error)
      )
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
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-2.5 text-sm">
          <span />
          <span className="text-muted-foreground text-xs font-medium">{t("email")}</span>
          <span className="text-muted-foreground text-xs font-medium">{t("push")}</span>
          {CATEGORIES.map((category) => (
            <React.Fragment key={category}>
              <Label className="font-normal">{t(`categories.${category}`)}</Label>
              <Switch
                checked={channels[category].email}
                onCheckedChange={(on) => toggle(category, "email", on)}
                aria-label={`${t(`categories.${category}`)} ${t("email")}`}
              />
              <Switch
                checked={channels[category].push}
                onCheckedChange={(on) => toggle(category, "push", on)}
                aria-label={`${t(`categories.${category}`)} ${t("push")}`}
              />
            </React.Fragment>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t("emailHint", { email })}</p>
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
