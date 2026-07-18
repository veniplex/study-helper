import type { GoalConfig, GoalType } from "@/db/schema/studies"
import type { PlanTaskSource } from "@/db/schema/plan"

/**
 * Goal-based plan-task generation (pure, testable).
 *
 * Turns a module's learning goals plus their backing data (outline topics,
 * assignments, writing milestones) into proposed plan-task drafts. Every draft
 * carries a `source {kind, refId}` so re-running generation is idempotent: the
 * action upserts by (kind, refId) and never duplicates or clobbers manual work.
 */

export type PlanTaskDraft = {
  title: string
  description: string | null
  estimatedMinutes: number
  dueDate: string | null
  goalId: string | null
  source: PlanTaskSource
  aiGenerated: boolean
}

export type TaskGenGoal = {
  id: string
  type: GoalType
  title: string | null
  dueDate: string | null
  config: GoalConfig
}

export type TaskGenInput = {
  goals: TaskGenGoal[]
  /** Latest-version outline topics for the module (for exam/oral goals). */
  outlineTopics: { id: string; title: string; weight: number }[]
  /** Open assignments (status !== "graded"/"submitted") for assignment goals. */
  assignments: { id: string; title: string; dueDate: string | null }[]
  /** Open writing milestones for term_paper/thesis goals. */
  milestones: { id: string; title: string; description: string | null; dueDate: string | null }[]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Outline weight (1–10) → estimated study minutes (30–150), rounded to 15. */
function minutesForTopic(weight: number): number {
  const raw = clamp(weight, 1, 10) * 15
  return clamp(Math.round(raw / 15) * 15, 30, 150)
}

/** Default writing phases when a project has no milestones yet. */
const SCIENTIFIC_PHASES = [
  "Themeneingrenzung",
  "Literaturrecherche",
  "Gliederung erstellen",
  "Rohfassung schreiben",
  "Überarbeitung & Korrektur",
]
const TASK_PHASES = [
  "Aufgabenstellung analysieren",
  "Bearbeitung",
  "Ausformulierung",
  "Überarbeitung & Korrektur",
]

function examDrafts(goal: TaskGenGoal, topics: TaskGenInput["outlineTopics"]): PlanTaskDraft[] {
  const drafts: PlanTaskDraft[] = []
  if (topics.length > 0) {
    for (const topic of topics) {
      drafts.push({
        title: `Lernen: ${topic.title}`,
        description: null,
        estimatedMinutes: minutesForTopic(topic.weight),
        dueDate: goal.dueDate,
        goalId: goal.id,
        source: { kind: "outline_topic", refId: topic.id },
        aiGenerated: false,
      })
    }
    // Review tasks in the run-up to the exam (cards/quiz recommendation).
    drafts.push(
      {
        title: "Wiederholung & Karteikarten",
        description: "Fällige Karten wiederholen und Wissenslücken schließen.",
        estimatedMinutes: 60,
        dueDate: goal.dueDate,
        goalId: goal.id,
        source: { kind: "ai", refId: `review-${goal.id}` },
        aiGenerated: false,
      },
      {
        title: "Probeklausur / Quiz",
        description: "Unter Prüfungsbedingungen testen.",
        estimatedMinutes: 90,
        dueDate: goal.dueDate,
        goalId: goal.id,
        source: { kind: "ai", refId: `mock-${goal.id}` },
        aiGenerated: false,
      }
    )
  } else {
    // No outline yet — a single grounding task the action may enrich via RAG.
    drafts.push({
      title: "Materialien durcharbeiten",
      description: "Materialien sichten und Kernthemen zusammenfassen.",
      estimatedMinutes: 120,
      dueDate: goal.dueDate,
      goalId: goal.id,
      source: { kind: "ai", refId: `study-${goal.id}` },
      aiGenerated: false,
    })
  }
  return drafts
}

function assignmentDrafts(
  goal: TaskGenGoal,
  assignments: TaskGenInput["assignments"]
): PlanTaskDraft[] {
  if (assignments.length > 0) {
    return assignments.map((a) => ({
      title: `Abgabe: ${a.title}`,
      description: null,
      estimatedMinutes: 90,
      dueDate: a.dueDate,
      goalId: goal.id,
      source: { kind: "assignment", refId: a.id },
      aiGenerated: false,
    }))
  }
  // Fallback: expectedCount placeholders.
  const count = goal.config.expectedCount ?? 0
  return Array.from({ length: clamp(count, 0, 30) }, (_, i) => ({
    title: `Abgabe ${i + 1}`,
    description: null,
    estimatedMinutes: 90,
    dueDate: null,
    goalId: goal.id,
    source: { kind: "ai" as const, refId: `assignment-${goal.id}-${i}` },
    aiGenerated: false,
  }))
}

function writingDrafts(goal: TaskGenGoal, milestones: TaskGenInput["milestones"]): PlanTaskDraft[] {
  if (milestones.length > 0) {
    return milestones.map((m) => ({
      title: m.title,
      description: m.description,
      estimatedMinutes: 120,
      dueDate: m.dueDate,
      goalId: goal.id,
      source: { kind: "milestone", refId: m.id },
      aiGenerated: false,
    }))
  }
  // No milestones — seed the variant's default phase tasks.
  const phases = goal.config.variant === "task" ? TASK_PHASES : SCIENTIFIC_PHASES
  return phases.map((title, i) => ({
    title,
    description: null,
    estimatedMinutes: 120,
    dueDate: i === phases.length - 1 ? goal.dueDate : null,
    goalId: goal.id,
    source: { kind: "ai" as const, refId: `phase-${goal.id}-${i}` },
    aiGenerated: false,
  }))
}

function presentationDrafts(goal: TaskGenGoal): PlanTaskDraft[] {
  const talk = goal.config.durationMinutes ?? 30
  return [
    {
      title: "Folien / Vortrag vorbereiten",
      description: null,
      estimatedMinutes: 120,
      dueDate: goal.dueDate,
      goalId: goal.id,
      source: { kind: "ai", refId: `prep-${goal.id}` },
      aiGenerated: false,
    },
    {
      title: "Probe-Vortrag",
      description: "Vortrag proben und Zeit stoppen.",
      estimatedMinutes: clamp(talk * 2, 45, 120),
      dueDate: goal.dueDate,
      goalId: goal.id,
      source: { kind: "ai", refId: `rehearse-${goal.id}` },
      aiGenerated: false,
    },
  ]
}

/** Builds the full set of proposed drafts for a module from its goals + data. */
export function buildTaskDrafts(input: TaskGenInput): PlanTaskDraft[] {
  const drafts: PlanTaskDraft[] = []
  for (const goal of input.goals) {
    switch (goal.type) {
      case "exam":
      case "oral_exam":
        drafts.push(...examDrafts(goal, input.outlineTopics))
        break
      case "assignments":
        drafts.push(...assignmentDrafts(goal, input.assignments))
        break
      case "term_paper":
      case "thesis":
      case "project":
        drafts.push(...writingDrafts(goal, input.milestones))
        break
      case "presentation":
        drafts.push(...presentationDrafts(goal))
        break
      case "other":
      default:
        break
    }
  }
  return drafts
}

/** Stable identity of a draft/task for idempotent upserts. */
export function sourceKey(source: PlanTaskSource): string {
  return `${source.kind}:${source.refId ?? ""}`
}
