import { z } from "zod"
import type { WritingVariant } from "@/db/schema/thesis"

/**
 * Pure prompt/schema builders shared by the degree thesis (`/thesis`) and module
 * writing projects (paper tab). Keeping these here means the scientific and task
 * variants — and both action sets — never duplicate prompt text. No `db` /
 * `server-only` imports so they stay trivially testable and reusable.
 */

// ---- Schemas ----------------------------------------------------------------

export const brainstormSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        researchQuestion: z.string(),
      })
    )
    .max(8),
})

export const milestonesSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        dueDate: z.string().describe("ISO date YYYY-MM-DD"),
      })
    )
    .max(15),
})

export const sourcesSchema = z.object({
  searchTerms: z.array(z.string()).max(20),
  sources: z
    .array(
      z.object({
        name: z.string().describe("A database, library catalog, journal or archive to search"),
        reason: z.string(),
      })
    )
    .max(12),
})

// ---- Prompt inputs ----------------------------------------------------------

/** The project fields the builders read (a subset of `writingProject`). */
export type WritingPromptFields = {
  title: string
  thesisType: string | null
  variant: WritingVariant
  researchQuestion: string | null
  taskDescription: string | null
  notes: string | null
  dueDate: string | null
}

// ---- Builders ---------------------------------------------------------------

export function buildBrainstormPrompt(interests: string): string {
  return `Suggest 5-8 concrete, feasible thesis topics based on these interests and constraints: ${interests}.
For each: a specific title, a 2-3 sentence description of scope and approach, and one possible research question. Write in the language of the input.`
}

/**
 * Chapter outline (scientific) or processing/write-up structure ("Bearbeitungs-
 * schritte", task). The task variant is derived from the assignment statement and
 * may include grounding excerpts from the module's material.
 */
export function buildOutlinePrompt(p: WritingPromptFields, groundingContext?: string): string {
  if (p.variant === "task") {
    return `Break this concrete assignment into a clear processing and write-up structure ("Bearbeitungsschritte"). Return a Markdown nested list: first the steps needed to work through the task, then the sections of the final write-up, each with a short note.
Title: ${p.title}
Type: ${p.thesisType ?? "assignment"}
Task: ${p.taskDescription ?? "not described yet"}
Notes: ${p.notes ?? "-"}${
      groundingContext
        ? `\n\nRelevant excerpts from the course material (ground the steps in these; do not invent facts beyond them):\n${groundingContext}`
        : ""
    }
Write in the language of the task description.`
  }
  return `Create a detailed chapter outline (as a Markdown nested list with short notes per section) for this thesis:
Title: ${p.title}
Type: ${p.thesisType ?? "thesis"}
Research question: ${p.researchQuestion ?? "not defined yet"}
Notes: ${p.notes ?? "-"}
Write in the language of the title.`
}

/** Milestone plan between `today` and the submission deadline (`p.dueDate`). */
export function buildMilestonesPrompt(p: WritingPromptFields, today: string): string {
  if (p.variant === "task") {
    return `Create a realistic milestone plan for this assignment. Today is ${today}, submission deadline is ${p.dueDate}.
Title: ${p.title}
Task: ${p.taskDescription ?? "tbd"}
Cover: understanding the task, gathering the needed material/information, working through each step, writing up, revision, and a buffer before submission. 6-12 milestones with dates between today and the deadline. Write in the language of the task.`
  }
  return `Create a realistic milestone plan for this thesis. Today is ${today}, submission deadline is ${p.dueDate}.
Title: ${p.title} (${p.thesisType ?? "thesis"})
Research question: ${p.researchQuestion ?? "tbd"}
Cover: literature research, exposé, methodology, data/implementation (if applicable), writing per major chapter, revision, buffer before submission. 8-12 milestones with dates between today and the deadline. Write in the language of the title.`
}

/**
 * Search-strategy suggestions (never fabricated citations): concrete search
 * terms plus databases/catalogs worth searching.
 */
export function buildSourcesPrompt(p: WritingPromptFields): string {
  return `Suggest where and how to look for literature and sources for this writing project. Do NOT invent citations, authors, titles, publishers or years — propose only search strategies.
Title: ${p.title}
${p.variant === "task" ? `Task: ${p.taskDescription ?? "-"}` : `Research question: ${p.researchQuestion ?? "-"}`}
Notes: ${p.notes ?? "-"}
Return (1) concrete search terms / keyword combinations (in the language of the title and, where useful, in English), and (2) databases, library catalogs, journals or archives worth searching, each with a one-line reason. Never fabricate specific references.
Write in the language of the title.`
}
