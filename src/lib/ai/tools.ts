import { z } from "zod"

/**
 * Write-tool definitions shared between the chat route (schema for the model),
 * the executor (validation) and the chat UI (labels/rendering).
 * These tools have NO execute on the server — the client renders a
 * confirmation card and runs the action only after the user approves.
 */

export const writeToolSchemas = {
  createDeckWithCards: z.object({
    moduleId: z.string().nullish().describe("Module id the deck belongs to (from context)"),
    name: z.string().min(1).max(200).describe("Deck name"),
    cards: z
      .array(z.object({ front: z.string().min(1).max(2000), back: z.string().min(1).max(4000) }))
      .min(1)
      .max(50),
  }),
  createQuizWithQuestions: z.object({
    moduleId: z.string().nullish(),
    title: z.string().min(1).max(200),
    questions: z
      .array(
        z.object({
          kind: z.enum(["multiple_choice", "free_text"]),
          prompt: z.string().min(1).max(2000),
          options: z.array(z.string().max(500)).max(8).nullish(),
          correctIndex: z.number().int().min(0).max(7).nullish(),
          referenceAnswer: z.string().max(2000).nullish(),
          explanation: z.string().max(2000).nullish(),
        })
      )
      .min(1)
      .max(30),
  }),
  createCalendarEvent: z.object({
    title: z.string().min(1).max(300),
    type: z.enum(["exam", "deadline", "lecture", "other"]),
    startsAt: z.string().describe("ISO datetime, e.g. 2026-07-20T10:00"),
    endsAt: z.string().nullish(),
    location: z.string().max(300).nullish(),
    notes: z.string().max(2000).nullish(),
    moduleId: z.string().nullish(),
  }),
  createAssignment: z.object({
    moduleId: z.string().describe("Module id the assignment belongs to (required)"),
    title: z.string().min(1).max(300),
    description: z.string().max(4000).nullish(),
    dueDate: z.string().nullish().describe("ISO date, e.g. 2026-08-01"),
    pointsMax: z.number().min(0).nullish(),
  }),
  createGoal: z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).nullish(),
    targetDate: z.string().nullish().describe("ISO date, e.g. 2026-08-01"),
    moduleId: z.string().nullish(),
  }),
} as const

export type WriteToolName = keyof typeof writeToolSchemas

export const WRITE_TOOL_NAMES = Object.keys(writeToolSchemas) as WriteToolName[]

export const writeToolDescriptions: Record<WriteToolName, string> = {
  createDeckWithCards:
    "Create a new flashcard deck with cards for the user. Use the module from the conversation/page context unless the user says otherwise. Ask before calling if the scope is ambiguous.",
  createQuizWithQuestions:
    "Create a new quiz with questions for the user. For multiple_choice provide options and correctIndex; for free_text provide referenceAnswer.",
  createCalendarEvent:
    "Create a calendar event (exam, deadline, lecture or other) for the user.",
  createAssignment:
    "Create a graded assignment (Abgabe) with deadline for a module. moduleId is required — use getContext to find it.",
  createGoal: "Create a learning goal for the user.",
}
