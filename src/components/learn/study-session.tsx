"use client"

import * as React from "react"
import { PartyPopper } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import { AnalyzeButton } from "@/components/learn/analyze-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { reviewCard } from "@/app/[locale]/(app)/deck-actions"
import { logStudySession } from "@/app/[locale]/(app)/learn-actions"
import { enqueue, isNetworkError } from "@/lib/offline/outbox"
import type { ReviewRating } from "@/lib/learning/fsrs"

export type StudyCard = { id: string; front: string; back: string }

const RATING_KEYS = { 1: "again", 2: "hard", 3: "good", 4: "easy" } as const

export function StudySession({
  backHref,
  cards,
  moduleId,
}: {
  backHref: string
  cards: StudyCard[]
  moduleId?: string
}) {
  const t = useTranslations("learn.decks")
  const tSession = useTranslations("learnSession")
  const [queue, setQueue] = React.useState(cards)
  const [revealed, setRevealed] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [counts, setCounts] = React.useState<Record<ReviewRating, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  })
  const [startedAt] = React.useState(() => Date.now())
  const [resultMinutes, setResultMinutes] = React.useState(1)
  const loggedRef = React.useRef(false)

  const current = queue[0]
  const reviewed = counts[1] + counts[2] + counts[3] + counts[4]

  // Log the session once when the queue is exhausted
  React.useEffect(() => {
    if (current || reviewed === 0 || loggedRef.current) return
    loggedRef.current = true
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))
    setResultMinutes(minutes)
    void logStudySession({
      moduleId: moduleId ?? null,
      durationMinutes: minutes,
      kind: "cards",
    }).catch(() => {})
  }, [current, reviewed, moduleId, startedAt])

  async function rate(rating: ReviewRating) {
    if (!current || pending) return
    setPending(true)
    try {
      const result = await reviewCard(current.id, rating)
      const nextDue = new Date(result.nextDue)
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }))
      setQueue((q) => {
        const rest = q.slice(1)
        // If the card is due again within this session (learning step), requeue it
        if (nextDue.getTime() - Date.now() < 15 * 60 * 1000) return [...rest, current]
        return rest
      })
      setRevealed(false)
    } catch (error) {
      if (isNetworkError(error)) {
        // Offline: queue the review and continue optimistically
        await enqueue("review-card", { cardId: current.id, rating })
        setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }))
        setQueue((q) => (rating === 1 ? [...q.slice(1), current] : q.slice(1)))
        setRevealed(false)
      } else {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setPending(false)
    }
  }

  if (!current) {
    const minutes = resultMinutes
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <PartyPopper className="text-muted-foreground size-8" />
        <p className="font-medium">{t("done")}</p>
        {reviewed > 0 && (
          <div className="w-full space-y-2 rounded-md border p-4 text-sm">
            <p className="text-muted-foreground text-xs">
              {tSession("result", { count: reviewed, minutes })}
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([1, 2, 3, 4] as const).map((r) => (
                <div key={r}>
                  <p className="text-lg font-semibold tabular-nums">{counts[r]}</p>
                  <p className="text-muted-foreground text-xs">{t(RATING_KEYS[r])}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {moduleId && reviewed > 0 && <AnalyzeButton moduleId={moduleId} />}
          <Button variant="outline" nativeButton={false} render={<Link href={backHref} />}>
            ←
          </Button>
        </div>
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
