"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { flush } from "@/lib/offline/outbox"
import { reviewCard } from "@/app/[locale]/(app)/deck-actions"
import { togglePlanItem } from "@/app/[locale]/(app)/learn-actions"
import type { ReviewRating } from "@/lib/learning/fsrs"

/** Replays queued offline writes on app start and whenever we come back online. */
export function OfflineSync() {
  const t = useTranslations("offline")

  React.useEffect(() => {
    async function sync() {
      const replayed = await flush({
        "review-card": (p) => reviewCard(String(p.cardId), Number(p.rating) as ReviewRating),
        "toggle-plan-item": (p) => togglePlanItem(String(p.itemId), Boolean(p.done)),
      })
      if (replayed > 0) toast.success(t("synced", { count: replayed }))
    }
    void sync()
    window.addEventListener("online", sync)
    return () => window.removeEventListener("online", sync)
  }, [t])

  return null
}
