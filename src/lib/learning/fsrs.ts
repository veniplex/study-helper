import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade } from "ts-fsrs"

export type CardSchedulingFields = {
  due: Date
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  lastReview: Date | null
}

const scheduler = fsrs({ enable_fuzz: true })

export type ReviewRating = 1 | 2 | 3 | 4 // Again | Hard | Good | Easy

function toFsrsCard(fields: CardSchedulingFields): FsrsCard {
  if (fields.reps === 0 && fields.state === 0) return createEmptyCard(fields.due)
  return {
    due: fields.due,
    stability: fields.stability,
    difficulty: fields.difficulty,
    elapsed_days: fields.elapsedDays,
    scheduled_days: fields.scheduledDays,
    learning_steps: fields.learningSteps,
    reps: fields.reps,
    lapses: fields.lapses,
    state: fields.state,
    last_review: fields.lastReview ?? undefined,
  }
}

/** Applies an FSRS review and returns the updated scheduling fields. */
export function scheduleReview(
  fields: CardSchedulingFields,
  rating: ReviewRating,
  now: Date = new Date()
): CardSchedulingFields {
  const result = scheduler.next(toFsrsCard(fields), now, rating as Grade)
  const card = result.card
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  }
}

/**
 * Next-due date for each of the four ratings, without mutating the card —
 * powers the interval preview on the rating buttons (E8). Pure: no DB, no
 * server round-trip.
 */
export function previewIntervals(
  fields: CardSchedulingFields,
  now: Date = new Date()
): Record<ReviewRating, Date> {
  const card = toFsrsCard(fields)
  const out = {} as Record<ReviewRating, Date>
  for (const rating of [1, 2, 3, 4] as const) {
    out[rating] = scheduler.next(card, now, rating as Grade).card.due
  }
  return out
}

/**
 * Compact human label for the gap between `from` and `due` ("<1m", "10m",
 * "3h", "4d", "2mo"). Rounds to the coarsest natural unit so the preview stays
 * glanceable. Pure — see fsrs.test.ts.
 */
export function formatReviewInterval(from: Date, due: Date): string {
  const mins = Math.round((due.getTime() - from.getTime()) / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  return `${months}mo`
}
