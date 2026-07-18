import "server-only"
import { z } from "zod"
import { db } from "@/db"
import { asc, eq } from "drizzle-orm"
import { assignment, deck, flashcard, moduleGoal, question, quiz, studyEvent } from "@/db/schema"
import { ownModule } from "@/lib/studies/access"
import { writeToolSchemas, type WriteToolName } from "./tools"

export type ToolExecutionResult = {
  ok: true
  /** Short human-readable confirmation, e.g. the created object's name. */
  label: string
  /** App-relative link to the created object (locale-less). */
  href?: string
  entityType: string
  entityId: string
  /** Row snapshot for the audit log (create → after). */
  snapshot?: unknown
}

async function resolveModule(moduleId: string | null | undefined, userId: string) {
  if (!moduleId) return null
  const mod = await ownModule(moduleId, userId)
  return mod
}

/**
 * Executes a user-confirmed AI write tool. Ownership is enforced here —
 * the model's input is never trusted directly.
 */
export async function executeWriteTool(
  name: WriteToolName,
  rawInput: unknown,
  userId: string,
  conversationId?: string | null
): Promise<ToolExecutionResult> {
  const result = await runTool(name, rawInput, userId)
  const { logAudit } = await import("@/lib/audit")
  await logAudit({
    userId,
    actor: "ai",
    operation: "create",
    entityType: result.entityType,
    entityId: result.entityId,
    entityLabel: result.label,
    after: result.snapshot ?? null,
    conversationId,
  })
  return result
}

async function runTool(
  name: WriteToolName,
  rawInput: unknown,
  userId: string
): Promise<ToolExecutionResult> {
  switch (name) {
    case "createDeckWithCards": {
      const input = writeToolSchemas.createDeckWithCards.parse(rawInput)
      const mod = await resolveModule(input.moduleId, userId)
      const [created] = await db
        .insert(deck)
        .values({ userId, moduleId: mod?.id ?? null, name: input.name, aiGenerated: true })
        .returning({ id: deck.id })
      await db.insert(flashcard).values(
        input.cards.map((c) => ({ deckId: created.id, front: c.front, back: c.back }))
      )
      return {
        ok: true,
        label: `${input.name} (${input.cards.length})`,
        href: mod ? `/studies/${mod.semester.programId}/${mod.id}/decks/${created.id}` : undefined,
        entityType: "deck",
        entityId: created.id,
      }
    }
    case "createQuizWithQuestions": {
      const input = writeToolSchemas.createQuizWithQuestions.parse(rawInput)
      const mod = await resolveModule(input.moduleId, userId)
      const [created] = await db
        .insert(quiz)
        .values({ userId, moduleId: mod?.id ?? null, title: input.title, aiGenerated: true })
        .returning({ id: quiz.id })
      await db.insert(question).values(
        input.questions.map((q, i) => ({
          quizId: created.id,
          kind: q.kind,
          prompt: q.prompt,
          options: q.kind === "multiple_choice" ? (q.options ?? []) : null,
          correctIndex: q.kind === "multiple_choice" ? (q.correctIndex ?? 0) : null,
          referenceAnswer: q.referenceAnswer ?? null,
          explanation: q.explanation ?? null,
          sortOrder: i,
        }))
      )
      return {
        ok: true,
        label: `${input.title} (${input.questions.length})`,
        href: mod
          ? `/studies/${mod.semester.programId}/${mod.id}/quizzes/${created.id}`
          : undefined,
        entityType: "quiz",
        entityId: created.id,
      }
    }
    case "createCalendarEvent": {
      const input = writeToolSchemas.createCalendarEvent.parse(rawInput)
      const startsAt = new Date(input.startsAt)
      if (Number.isNaN(startsAt.getTime())) throw new Error("Invalid startsAt")
      const endsAt = input.endsAt ? new Date(input.endsAt) : null
      if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Invalid endsAt")
      const mod = await resolveModule(input.moduleId, userId)
      const [created] = await db
        .insert(studyEvent)
        .values({
          userId,
          title: input.title,
          type: input.type,
          startsAt,
          endsAt,
          location: input.location ?? null,
          notes: input.notes ?? null,
          moduleId: mod?.id ?? null,
          reminderOffsets: [1440],
          aiGenerated: true,
        })
        .returning({ id: studyEvent.id })
      return {
        ok: true,
        label: input.title,
        href: "/calendar",
        entityType: "event",
        entityId: created.id,
      }
    }
    case "createAssignment": {
      const input = writeToolSchemas.createAssignment.parse(rawInput)
      const mod = await ownModule(input.moduleId, userId)
      const dueDate = input.dueDate ? z.string().date().parse(input.dueDate) : null
      // Link the sheet to a goal: the caller-supplied one (validated against the
      // module) or, by default, the module's assignments goal.
      const goals = await db.query.moduleGoal.findMany({
        where: eq(moduleGoal.moduleId, mod.id),
        orderBy: (g) => [asc(g.sortOrder), asc(g.createdAt)],
        columns: { id: true, type: true },
      })
      const goalId = input.goalId
        ? (goals.find((g) => g.id === input.goalId)?.id ?? null)
        : (goals.find((g) => g.type === "assignments")?.id ?? null)
      const [created] = await db
        .insert(assignment)
        .values({
          userId,
          moduleId: mod.id,
          goalId,
          title: input.title,
          description: input.description ?? null,
          dueDate,
          pointsMax: input.pointsMax != null ? String(input.pointsMax) : null,
          aiGenerated: true,
        })
        .returning({ id: assignment.id })
      return {
        ok: true,
        label: input.title,
        href: `/studies/${mod.semester.programId}/${mod.id}/assignments`,
        entityType: "assignment",
        entityId: created.id,
      }
    }
  }
}
