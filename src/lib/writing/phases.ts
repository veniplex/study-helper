import type { TaskPhase, ThesisPhase, WritingPhase, WritingVariant } from "@/db/schema/thesis"

/**
 * Phase sequences per writing variant. Kept here (not in the DB) so the
 * workspace, the actions' phase validation and the i18n labels share one
 * source of truth. i18n labels live under the `writing.phases.*` namespace.
 */
export const SCIENTIFIC_PHASES = [
  "topic",
  "exposé",
  "research",
  "writing",
  "revision",
  "submitted",
] as const satisfies readonly ThesisPhase[]

export const TASK_PHASES = [
  "briefing",
  "working",
  "writing",
  "revision",
  "submitted",
] as const satisfies readonly TaskPhase[]

/** The ordered phases for a writing variant. */
export function phasesFor(variant: WritingVariant): readonly WritingPhase[] {
  return variant === "task" ? TASK_PHASES : SCIENTIFIC_PHASES
}

/** The default (first) phase a fresh project of this variant starts in. */
export function initialPhase(variant: WritingVariant): WritingPhase {
  return phasesFor(variant)[0]
}

/** True if `phase` is a valid phase for the given variant. */
export function isValidPhase(variant: WritingVariant, phase: string): phase is WritingPhase {
  return (phasesFor(variant) as readonly string[]).includes(phase)
}
