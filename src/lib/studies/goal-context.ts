import "server-only"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/db"
import { studyModule, writingProject } from "@/db/schema"
import type { GoalGradingRole, GoalType, WritingVariant } from "@/db/schema"
import type { WritingPhase } from "@/db/schema/thesis"

/** One goal, flattened for prompt use. */
export type GoalContextGoal = {
  type: GoalType
  title: string | null
  gradingRole: GoalGradingRole
  dueDate: string | null
  /** Whole days from `today` to `dueDate` (negative = past); null when undated. */
  daysUntil: number | null
  variant?: WritingVariant
  taskDescription?: string
  requiresSources?: boolean
  attemptsUsed?: number
  maxAttempts?: number
}

export type ModuleGoalContext = {
  goals: GoalContextGoal[]
  hasThesis: boolean
  hasTermPaper: boolean
  /** dueDate of the module's exam/oral-exam goal, if any. */
  examDueDate: string | null
  /** Phase of the module's live writing project (term paper/thesis), if any. */
  writingPhase: WritingPhase | null
}

/** Whole days from `today` (date-only) to an ISO `dueDate`. Pure. */
function daysUntil(dueDate: string | null, today: Date): number | null {
  if (!dueDate) return null
  const due = new Date(`${dueDate}T00:00:00Z`)
  if (Number.isNaN(due.getTime())) return null
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((due.getTime() - start) / 86_400_000)
}

/**
 * Loads a module's learning goals plus minimal attempt/writing state as a small
 * structured object for goal-aware AI features. Callers already own the module
 * (chat route, generation actions, progress analysis), so ownership is not
 * re-checked here.
 */
export async function getModuleGoalContext(
  moduleId: string,
  today: Date = new Date()
): Promise<ModuleGoalContext> {
  const mod = await db.query.studyModule.findFirst({
    where: eq(studyModule.id, moduleId),
    columns: { id: true },
    with: {
      goals: {
        orderBy: (g) => [asc(g.sortOrder), asc(g.createdAt)],
        with: { attempts: { columns: { id: true } } },
      },
    },
  })

  const empty: ModuleGoalContext = {
    goals: [],
    hasThesis: false,
    hasTermPaper: false,
    examDueDate: null,
    writingPhase: null,
  }
  if (!mod) return empty

  const goals: GoalContextGoal[] = mod.goals.map((g) => {
    const goal: GoalContextGoal = {
      type: g.type,
      title: g.title,
      gradingRole: g.gradingRole,
      dueDate: g.dueDate,
      daysUntil: daysUntil(g.dueDate, today),
      attemptsUsed: g.attempts.length,
      maxAttempts: g.maxAttempts,
    }
    if (g.config.variant) goal.variant = g.config.variant
    if (g.config.taskDescription) goal.taskDescription = g.config.taskDescription
    if (g.config.requiresSources != null) goal.requiresSources = g.config.requiresSources
    return goal
  })

  const hasThesis = goals.some((g) => g.type === "thesis")
  const hasTermPaper = goals.some((g) => g.type === "term_paper")
  const examDueDate = goals.find((g) => g.type === "exam" || g.type === "oral_exam")?.dueDate ?? null

  // Writing phase drives the chat auto-mode (writing vs. planning). Only the
  // live (non-superseded) project of a paper/thesis goal counts.
  let writingPhase: WritingPhase | null = null
  const writingGoalIds = mod.goals
    .filter((g) => g.type === "thesis" || g.type === "term_paper")
    .map((g) => g.id)
  if (writingGoalIds.length > 0) {
    const project = await db.query.writingProject.findFirst({
      where: and(
        inArray(writingProject.goalId, writingGoalIds),
        isNull(writingProject.supersededById)
      ),
      columns: { phase: true },
    })
    writingPhase = project?.phase ?? null
  }

  return { goals, hasThesis, hasTermPaper, examDueDate, writingPhase }
}

/** English noun for a goal type (fallback when the goal has no free-text title). */
const GOAL_NOUN: Record<GoalType, string> = {
  exam: "an exam",
  oral_exam: "an oral exam",
  assignments: "graded assignments",
  term_paper: "a term paper",
  presentation: "a presentation",
  project: "a project",
  thesis: "a thesis",
  other: "an assessment",
}

function dueSuffix(g: GoalContextGoal): string {
  if (!g.dueDate) return ""
  if (g.daysUntil == null) return ` on ${g.dueDate}`
  if (g.daysUntil >= 0) {
    return ` on ${g.dueDate} (in ${g.daysUntil} day${g.daysUntil === 1 ? "" : "s"})`
  }
  const ago = -g.daysUntil
  return ` on ${g.dueDate} (${ago} day${ago === 1 ? "" : "s"} ago)`
}

/** Describes one goal, e.g. "a Klausur on 2026-02-10 (in 23 days) (bonus)". */
function describeGoal(g: GoalContextGoal): string {
  let s = g.title?.trim() ? g.title.trim() : GOAL_NOUN[g.type]
  s += dueSuffix(g)
  if (g.gradingRole === "bonus") s += " (bonus)"
  else if (g.gradingRole === "practice") s += " (practice only)"
  if (g.attemptsUsed && g.maxAttempts) {
    s += ` — ${g.attemptsUsed} of ${g.maxAttempts} attempt${g.maxAttempts === 1 ? "" : "s"} used`
  }
  return s
}

/**
 * A compact one-paragraph English description of a module's goals for prompts.
 * Pure — reads only the structured context (daysUntil is precomputed).
 */
export function formatGoalContext(ctx: ModuleGoalContext): string {
  if (ctx.goals.length === 0) return ""

  const sentences = [`This module is assessed by: ${ctx.goals.map(describeGoal).join("; ")}.`]

  // Paper variant / task summary, when relevant.
  const paper = ctx.goals.find((g) => g.type === "term_paper" || g.type === "thesis")
  if (paper) {
    if (paper.variant === "task" && paper.taskDescription) {
      sentences.push(`The ${GOAL_NOUN[paper.type].replace(/^an? /, "")} is a concrete task: ${paper.taskDescription.slice(0, 300)}.`)
    } else if (paper.variant === "scientific" || paper.requiresSources) {
      sentences.push(
        `It is a scientific paper${paper.requiresSources ? " that requires cited sources (never fabricate references)" : ""}.`
      )
    }
  }

  // A short guidance line biasing the assistant toward the dominant goal.
  if (ctx.hasThesis || ctx.hasTermPaper) {
    sentences.push(
      "The student is working on a written paper — help with structure, argumentation and academic writing."
    )
  } else if (ctx.goals.some((g) => g.type === "exam" || g.type === "oral_exam")) {
    sentences.push(
      "The student is preparing for an exam — bias explanations toward exam readiness."
    )
  } else if (ctx.goals.some((g) => g.type === "presentation")) {
    sentences.push("The student is preparing a presentation — help them structure and rehearse it.")
  }

  return sentences.join(" ")
}

/**
 * A single sentence for deck/quiz generation that mirrors the module's exam
 * format. Returns "" when the module has no exam-like goal, so generation is
 * unchanged for non-exam modules.
 */
export function formatExamContext(ctx: ModuleGoalContext): string {
  const goal = ctx.goals.find((g) => g.type === "exam" || g.type === "oral_exam")
  if (!goal) return ""
  const label = goal.title?.trim() ? goal.title.trim() : GOAL_NOUN[goal.type]
  const format = goal.type === "oral_exam" ? "an oral exam" : "a written exam"
  return `This module is assessed by ${label}${dueSuffix(goal)}. Make the items mirror the format of ${format} and prepare the student for it.`
}
