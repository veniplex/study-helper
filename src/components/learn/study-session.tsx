"use client"

import * as React from "react"
import { PartyPopper } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { reviewCard } from "@/app/[locale]/(app)/learn/decks/actions"
import type { ReviewRating } from "@/lib/learning/fsrs"

export type StudyCard = { id: string; front: string; back: string }

export function StudySession({ deckId, cards }: { deckId: string; cards: StudyCard[] }) {
  const t = useTranslations("learn.decks")
  const [queue, setQueue] = React.useState(cards)
  const [revealed, setRevealed] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const current = queue[0]

  async function rate(rating: ReviewRating) {
    if (!current || pending) return
    setPending(true)
    try {
      const result = await reviewCard(current.id, rating)
      const nextDue = new Date(result.nextDue)
      setQueue((q) => {
        const rest = q.slice(1)
        // If the card is due again within this session (learning step), requeue it
        if (nextDue.getTime() - Date.now() < 15 * 60 * 1000) return [...rest, current]
        return rest
      })
      setRevealed(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  if (!current) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <PartyPopper className="text-muted-foreground size-8" />
        <p className="font-medium">{t("done")}</p>
        <Button variant="outline" nativeButton={false} render={<Link href={`/learn/decks/${deckId}`} />}>
          ←
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-muted-foreground text-center text-xs">
        {t("remaining", { count: queue.length })}
      </p>
      <Card className="min-h-56">
        <CardContent className="flex flex-col justify-center gap-4 py-8 text-center">
          <p className="text-lg font-medium whitespace-pre-wrap">{current.front}</p>
          {revealed && (
            <>
              <hr className="border-border" />
              <p className="text-base whitespace-pre-wrap">{current.back}</p>
            </>
          )}
        </CardContent>
      </Card>

      {!revealed ? (
        <Button className="w-full" onClick={() => setRevealed(true)}>
          {t("showAnswer")}
        </Button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Button variant="destructive" disabled={pending} onClick={() => rate(1)}>
            {t("again")}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => rate(2)}>
            {t("hard")}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => rate(3)}>
            {t("good")}
          </Button>
          <Button disabled={pending} onClick={() => rate(4)}>
            {t("easy")}
          </Button>
        </div>
      )}
    </div>
  )
}
