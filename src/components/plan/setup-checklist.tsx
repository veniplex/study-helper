"use client"

import * as React from "react"
import { ArrowRight, Check, ListChecks, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type SetupStepKey = "module" | "examDate" | "availability" | "tasks" | "plan"

export type SetupStep = {
  key: SetupStepKey
  done: boolean
  /** Where the "do this" affordance links to. */
  href: string
}

/**
 * A1 + E15: friendly, dismissible setup checklist. Step completion is derived
 * server-side and passed in as booleans; each incomplete step links to the
 * surface that completes it. Renders on the module plan tab (subset), the
 * strategy board first-run state and as an onboarding follow-up CTA.
 *
 * Auto-hides once every passed step is done, or when the user dismisses it
 * (remembered per `storageKey` in localStorage).
 */
export function SetupChecklist({
  steps,
  storageKey,
}: {
  steps: SetupStep[]
  storageKey: string
}) {
  const t = useTranslations("plan.checklist")
  const key = `setup-checklist:${storageKey}`

  // Read the persisted dismissal without a setState-in-effect (SSR-safe: the
  // server snapshot is always "not dismissed", the client hydrates from storage).
  const persisted = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb)
      return () => window.removeEventListener("storage", cb)
    },
    () => {
      try {
        return localStorage.getItem(key) === "1"
      } catch {
        return false
      }
    },
    () => false
  )
  const [dismissedNow, setDismissedNow] = React.useState(false)
  const dismissed = persisted || dismissedNow

  function dismiss() {
    setDismissedNow(true)
    try {
      localStorage.setItem(key, "1")
    } catch {
      // ignore persistence failures
    }
  }

  const allDone = steps.every((s) => s.done)
  if (dismissed || steps.length === 0 || allDone) return null

  const nextStep = steps.find((s) => !s.done)
  const doneCount = steps.filter((s) => s.done).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <ListChecks className="size-4" />
          </span>
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <p className="text-muted-foreground text-xs">
              {t("progress", { done: doneCount, total: steps.length })}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label={t("dismiss")}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((step, i) => {
          const isNext = step === nextStep
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2",
                isNext && "bg-accent/50"
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", step.done && "text-muted-foreground")}>
                  {t(`steps.${step.key}.title`)}
                </p>
                <p className="text-muted-foreground text-xs">{t(`steps.${step.key}.desc`)}</p>
              </div>
              {!step.done && (
                <Button
                  size="sm"
                  variant={isNext ? "default" : "outline"}
                  nativeButton={false}
                  render={<Link href={step.href} />}
                >
                  {t("go")}
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
