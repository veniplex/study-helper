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
