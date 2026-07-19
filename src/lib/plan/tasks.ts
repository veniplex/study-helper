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

/** What a draft is for; drives the pre-exam consolidation window scheduling. */
export type PlanTaskCategory = "learn" | "review" | "cards"

export type PlanTaskDraft = {
  title: string
  description: string | null
  estimatedMinutes: number
  dueDate: string | null
  goalId: string | null
  source: PlanTaskSource
  category: PlanTaskCategory
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

/** UTC-based day math so it never depends on the host timezone/clock. */
const MS_PER_DAY = 86400000
function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}
function addDays(date: string, n: number): string {
  return new Date(parseDay(date) + n * MS_PER_DAY).toISOString().slice(0, 10)
}
function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / MS_PER_DAY)
}

/**
 * Length of the pre-exam consolidation window in days: an explicit value if the
 * goal carries one, otherwise `clamp(round(0.25 × daysUntilExam), 3, 14)` — a
 * quarter of the remaining runway, floored at 3 and capped at 14 days. Pure.
 */
export function reviewDays(examDate: string, today: string, explicit?: number | null): number {
  if (explicit != null && Number.isFinite(explicit)) return clamp(Math.round(explicit), 3, 14)
  const until = Math.max(0, daysBetween(today, examDate))
  return clamp(Math.round(0.25 * until), 3, 14)
}

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

function examDrafts(
  goal: TaskGenGoal,
  topics: TaskGenInput["outlineTopics"],
  today: string
): PlanTaskDraft[] {
  const drafts: PlanTaskDraft[] = []
  const examDate = goal.dueDate
  // Effective learning deadline sits BEFORE the consolidation window so new
  // material is done by the time review starts. Falls back to the exam date
  // (or null) when there is no exam date to anchor the window.
  const rd = examDate ? reviewDays(examDate, today, goal.config.reviewDays) : null
  const learnDue = examDate && rd != null ? addDays(examDate, -rd) : examDate

  if (topics.length > 0) {
    for (const topic of topics) {
      drafts.push({
        title: `Lernen: ${topic.title}`,
        description: null,
        estimatedMinutes: minutesForTopic(topic.weight),
        dueDate: learnDue,
        goalId: goal.id,
        source: { kind: "outline_topic", refId: topic.id },
        category: "learn",
        aiGenerated: false,
      })
    }
    // Spaced consolidation series inside [examDate−reviewDays, examDate]: n
    // review tasks + a companion cards task each, plus one mock the day before.
    if (examDate && rd != null) {
      const windowStart = addDays(examDate, -rd)
      const n = clamp(Math.ceil(rd / 3), 2, 5)
      for (let i = 0; i < n; i++) {
        const offset = clamp(Math.round(((i + 1) / n) * rd), 1, rd)
        const due = addDays(windowStart, offset)
        drafts.push({
          title: `Wiederholung ${i + 1}/${n}`,
          description: "Kernthemen aktiv wiederholen und Wissenslücken schließen.",
          estimatedMinutes: 60,
          dueDate: due,
          goalId: goal.id,
          source: { kind: "ai", refId: `review-${goal.id}-${i}` },
          category: "review",
          aiGenerated: false,
        })
        drafts.push({
          title: `Karten & Fehler-Deck ${i + 1}/${n}`,
          description: "Fällige Karteikarten und Karten aus dem Fehler-Deck üben.",
          estimatedMinutes: 30,
          dueDate: due,
          goalId: goal.id,
          source: { kind: "ai", refId: `cards-${goal.id}-${i}` },
          category: "cards",
          aiGenerated: false,
        })
      }
      drafts.push({
        title: "Probeklausur / Quiz",
        description: "Unter Prüfungsbedingungen testen.",
        estimatedMinutes: 90,
        dueDate: addDays(examDate, -1),
        goalId: goal.id,
        source: { kind: "ai", refId: `mock-${goal.id}` },
        category: "review",
        aiGenerated: false,
      })
    }
  } else {
    // No outline yet — a single grounding task the action may enrich via RAG.
    drafts.push({
      title: "Materialien durcharbeiten",
      description: "Materialien sichten und Kernthemen zusammenfassen.",
      estimatedMinutes: 120,
      dueDate: learnDue,
      goalId: goal.id,
      source: { kind: "ai", refId: `study-${goal.id}` },
      category: "learn",
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
      category: "learn" as const,
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
    category: "learn" as const,
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
      category: "learn" as const,
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
    category: "learn" as const,
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
      category: "learn",
      aiGenerated: false,
    },
    {
      title: "Probe-Vortrag",
      description: "Vortrag proben und Zeit stoppen.",
      estimatedMinutes: clamp(talk * 2, 45, 120),
      dueDate: goal.dueDate,
      goalId: goal.id,
      source: { kind: "ai", refId: `rehearse-${goal.id}` },
      category: "learn",
      aiGenerated: false,
    },
  ]
}

/**
 * Builds the full set of proposed drafts for a module from its goals + data.
 * `today` (ISO date) anchors the pre-exam consolidation window math.
 */
export function buildTaskDrafts(input: TaskGenInput, today: string): PlanTaskDraft[] {
  const drafts: PlanTaskDraft[] = []
  for (const goal of input.goals) {
    switch (goal.type) {
      case "exam":
      case "oral_exam":
        drafts.push(...examDrafts(goal, input.outlineTopics, today))
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
