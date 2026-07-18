"use client"

import * as React from "react"
import { PartyPopper } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link } from "@/i18n/navigation"
import { AnalyzeButton } from "@/components/learn/analyze-button"
import { Markdown } from "@/components/ai/markdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { reviewCard } from "@/app/[locale]/(app)/deck-actions"
import { logStudySession } from "@/app/[locale]/(app)/learn-actions"
import { enqueue, isNetworkError } from "@/lib/offline/outbox"
import type { ReviewRating } from "@/lib/learning/fsrs"
import { cn } from "@/lib/utils"

export type StudyCard = { id: string; front: string; back: string }

const RATING_KEYS = { 1: "again", 2: "hard", 3: "good", 4: "easy" } as const

export function StudySession({
  backHref,
  cards,
  moduleId,
  totalDue,
}: {
  backHref: string
  cards: StudyCard[]
  moduleId?: string
  /** Total due cards when the session is capped; shows a "X of Y" hint. */
  totalDue?: number
}) {
  const t = useTranslations("learn.decks")
  const tSession = useTranslations("learnSession")
  const [queue, setQueue] = React.useState(cards)
  const [revealed, setRevealed] = React.useState(false)
  // Rating buttons stay visible once the card was revealed, even after
  // flipping back to the front.
  const [everRevealed, setEverRevealed] = React.useState(false)
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

  // Touch swipe (mobile): after reveal, swipe right = good, left = again.
  const touchStartX = React.useRef<number | null>(null)
  const [dragX, setDragX] = React.useState(0)

  function onTouchStart(e: React.TouchEvent) {
    if (!everRevealed) return
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    setDragX(e.touches[0].clientX - touchStartX.current)
  }
  function onTouchEnd() {
    const delta = dragX
    touchStartX.current = null
    setDragX(0)
    if (Math.abs(delta) > 80) void rate(delta > 0 ? 3 : 1)
  }

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
    }).catch((error: unknown) => {
      // Non-blocking background logging, but never fully silent — a persistent
      // failure here quietly under-counts the study statistics.
      console.error("[study-session] failed to log session", error)
    })
  }, [current, reviewed, moduleId, startedAt])

  async function rate(rating: ReviewRating) {
    if (!current || pending) return
    setPending(true)
    try {
      await reviewCard(current.id, rating)
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }))
      // Only "again" requeues the card within this session — everything else
      // is done for today (a lone card would otherwise repeat immediately).
      setQueue((q) => (rating === 1 ? [...q.slice(1), current] : q.slice(1)))
      setRevealed(false)
      setEverRevealed(false)
    } catch (error) {
      if (isNetworkError(error)) {
        // Offline: queue the review and continue optimistically
        await enqueue("review-card", { cardId: current.id, rating })
        setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }))
        setQueue((q) => (rating === 1 ? [...q.slice(1), current] : q.slice(1)))
        setRevealed(false)
        setEverRevealed(false)
      } else {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setPending(false)
    }
  }

  if (!current && reviewed === 0) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center gap-4 text-center">
        <PartyPopper className="text-muted-foreground size-8" />
        <p className="font-medium">{t("noDue")}</p>
        <Button variant="outline" nativeButton={false} render={<Link href={backHref} />}>
          ←
        </Button>
      </div>
    )
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
        {totalDue != null && totalDue > cards.length && (
          <> · {tSession("capped", { shown: cards.length, total: totalDue })}</>
        )}
      </p>
      {/* key on the card id → the flip resets instantly for the next card */}
      <div
        key={current.id}
        className="touch-pan-y [perspective:1200px]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={
          dragX !== 0
            ? {
                transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)`,
                opacity: Math.max(0.4, 1 - Math.abs(dragX) / 400),
              }
            : undefined
        }
      >
        <button
          type="button"
          onClick={() => {
            setRevealed((r) => !r)
            setEverRevealed(true)
          }}
          className={cn(
            "relative block min-h-56 w-full text-left transition-transform duration-500 [transform-style:preserve-3d]",
            revealed && "[transform:rotateY(180deg)]"
          )}
          aria-label={t("showAnswer")}
        >
          <Card className="min-h-56 [backface-visibility:hidden]">
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("front")}
              </span>
              <div className="text-lg font-medium">
                <Markdown>{current.front}</Markdown>
              </div>
            </CardContent>
          </Card>
          <Card className="absolute inset-0 min-h-56 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("back")}
              </span>
              <div className="text-base">
                <Markdown>{current.back}</Markdown>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      {everRevealed && (
        <p className="text-muted-foreground text-center text-xs sm:hidden">
          {tSession("swipeHint")}
        </p>
      )}
      {!everRevealed ? (
        <Button
          className="w-full"
          onClick={() => {
            setRevealed(true)
            setEverRevealed(true)
          }}
        >
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
