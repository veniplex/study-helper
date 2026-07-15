import "server-only"
import { generateObject } from "ai"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  flashcard,
  generationCoverage,
  generationJob,
  material,
  question,
  quiz,
  type GenerationJobStatus,
  type GenerationKind,
} from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { runAi } from "@/lib/ai/run"
import { assertWithinLimit } from "@/lib/ai/usage"
import { getModuleMaterialSample, searchChunks, searchChunksInMaterials } from "@/lib/ai/rag"
import { buildModuleOutline, type OutlineTopic } from "./outline"
import { Deduper, embedTexts } from "./dedup"

const MAX_GROUNDING_CHARS = 12000
const DEFAULT_CARDS_PER_TOPIC = 6
const DEFAULT_QUESTIONS_PER_TOPIC = 4

export type GenParams = {
  perTopic?: number
  language?: string
  mixed?: boolean
}

const cardSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).max(60),
})

const questionSchema = z.object({
  questions: z
    .array(
      z.object({
        kind: z.enum(["multiple_choice", "free_text"]),
        prompt: z.string(),
        options: z.array(z.string()).default([]),
        correctIndex: z.number().int().default(-1),
        referenceAnswer: z.string().default(""),
        explanation: z.string().default(""),
      })
    )
    .max(30),
})

// ---- Job creation ---------------------------------------------------------------

async function createJob(
  userId: string,
  moduleId: string,
  kind: GenerationKind,
  targetId: string,
  params: GenParams
): Promise<string> {
  const [job] = await db
    .insert(generationJob)
    .values({ userId, moduleId, kind, targetId, status: "pending", params })
    .returning({ id: generationJob.id })
  const { enqueueGeneration } = await import("@/lib/jobs")
  await enqueueGeneration(job.id)
  return job.id
}

/** Starts a coverage-driven fill of an existing deck. */
export async function startDeckGeneration(
  userId: string,
  deckId: string,
  moduleId: string,
  params: GenParams
): Promise<string> {
  return createJob(userId, moduleId, "deck", deckId, params)
}

/** Creates a quiz and starts a coverage-driven fill of it. */
export async function startQuizGeneration(
  userId: string,
  moduleId: string,
  opts: { title: string; params: GenParams }
): Promise<{ jobId: string; quizId: string }> {
  const [created] = await db
    .insert(quiz)
    .values({ userId, moduleId, title: opts.title, aiGenerated: true })
    .returning({ id: quiz.id })
  const jobId = await createJob(userId, moduleId, "quiz", created.id, opts.params)
  return { jobId, quizId: created.id }
}

// ---- Grounding + per-topic generation -------------------------------------------

async function groundTopic(userId: string, moduleId: string, topic: OutlineTopic): Promise<string> {
  const query = `${topic.title}\n${topic.summary ?? ""}`.trim()
  let hits =
    topic.sourceMaterialIds.length > 0
      ? await searchChunksInMaterials(userId, query, topic.sourceMaterialIds, { limit: 16 })
      : []
  if (hits.length === 0) hits = await searchChunks(userId, query, { moduleId, limit: 12 })

  let text = hits.map((h) => `[${h.materialName}] ${h.content}`).join("\n---\n")

  if (!text) {
    // No embeddings available — ground on source-material summaries/preview text.
    const ids = topic.sourceMaterialIds
    if (ids.length > 0) {
      const mats = await db.query.material.findMany({
        where: inArray(material.id, ids),
        columns: { name: true, summary: true, textContent: true },
      })
      text = mats
        .map((m) => `[${m.name}] ${(m.summary ?? m.textContent ?? "").slice(0, 3000)}`)
        .join("\n---\n")
    }
    if (!text) {
      const sample = await getModuleMaterialSample(userId, moduleId)
      text = sample.map((h) => `[${h.materialName}] ${h.content}`).join("\n---\n")
    }
  }
  return text.slice(0, MAX_GROUNDING_CHARS)
}

async function generateTopicCards(
  userId: string,
  modelRef: string,
  model: Awaited<ReturnType<typeof getLanguageModel>>,
  targetId: string,
  topic: OutlineTopic,
  grounding: string,
  count: number,
  language: string
): Promise<{ front: string; back: string }[]> {
  const { object } = await runAi(
    {
      userId,
      model: modelRef,
      feature: "flashcards",
      operation: "ai_generate",
      entityType: "deck",
      entityId: targetId,
      entityLabel: topic.title,
      audit: false,
    },
    () =>
      generateObject({
        model,
        schema: cardSchema,
        prompt: `Create up to ${count} high-quality spaced-repetition flashcards about the topic "${topic.title}".${
          topic.summary ? ` Topic scope: ${topic.summary}` : ""
        }
Base the cards strictly on the excerpts below — do not invent facts not present. Each card: a concise question/term on the front, a precise answer/definition on the back. Write all cards in ${language}.

Excerpts:
${grounding || "(no excerpts available — use the topic title/scope)"}`,
      })
  )
  return object.cards.slice(0, count)
}

async function generateTopicQuestions(
  userId: string,
  modelRef: string,
  model: Awaited<ReturnType<typeof getLanguageModel>>,
  targetId: string,
  topic: OutlineTopic,
  grounding: string,
  count: number,
  mixed: boolean,
  language: string
): Promise<z.infer<typeof questionSchema>["questions"]> {
  const { object } = await runAi(
    {
      userId,
      model: modelRef,
      feature: "quiz",
      operation: "ai_generate",
      entityType: "quiz",
      entityId: targetId,
      entityLabel: topic.title,
      audit: false,
    },
    () =>
      generateObject({
        model,
        schema: questionSchema,
        prompt: `Create up to ${count} exam-style quiz questions about the topic "${topic.title}".${
          topic.summary ? ` Topic scope: ${topic.summary}` : ""
        }
${mixed ? "Mix multiple_choice (exactly 4 plausible options, correctIndex set) and free_text (referenceAnswer set), about 70/30." : "Use only multiple_choice questions with exactly 4 plausible options and correctIndex set."}
Give each question a short explanation of the correct answer. Base questions strictly on the excerpts. Write everything in ${language}.

Excerpts:
${grounding || "(no excerpts available — use the topic title/scope)"}`,
      })
  )
  return object.questions.slice(0, count)
}

// ---- Coverage orchestration -----------------------------------------------------

async function upsertCoverage(
  targetId: string,
  topicId: string,
  jobId: string,
  status: "generating" | "done" | "failed",
  producedCount = 0
): Promise<void> {
  await db
    .insert(generationCoverage)
    .values({ targetId, topicId, jobId, status, producedCount })
    .onConflictDoUpdate({
      target: [generationCoverage.targetId, generationCoverage.topicId],
      set: { jobId, status, producedCount },
    })
}

async function loadExistingKeys(kind: GenerationKind, targetId: string): Promise<string[]> {
  if (kind === "deck") {
    const rows = await db
      .select({ front: flashcard.front })
      .from(flashcard)
      .where(eq(flashcard.deckId, targetId))
    return rows.map((r) => r.front)
  }
  const rows = await db
    .select({ prompt: question.prompt })
    .from(question)
    .where(eq(question.quizId, targetId))
  return rows.map((r) => r.prompt)
}

async function nextQuizSortOrder(quizId: string): Promise<number> {
  const [row] = await db
    .select({ sortOrder: question.sortOrder })
    .from(question)
    .where(eq(question.quizId, quizId))
    .orderBy(desc(question.sortOrder))
    .limit(1)
  return (row?.sortOrder ?? -1) + 1
}

async function fail(jobId: string, message: string): Promise<void> {
  await db
    .update(generationJob)
    .set({ status: "failed", error: message.slice(0, 500) })
    .where(eq(generationJob.id, jobId))
}

/**
 * Runs a coverage-driven generation job: (re)builds the module outline, then for
 * every topic that isn't already covered for this target, generates items from
 * the topic's own grounding, de-duplicates against everything produced so far,
 * and persists. Reuses existing coverage so re-runs only fill new/uncovered
 * topics. Resumable — already-done topics are skipped on retry.
 */
export async function runCoverageGeneration(jobId: string): Promise<void> {
  const job = await db.query.generationJob.findFirst({ where: eq(generationJob.id, jobId) })
  if (!job || job.status === "completed" || job.status === "canceled") return

  await db
    .update(generationJob)
    .set({ status: "running", error: null })
    .where(eq(generationJob.id, jobId))

  let topics: OutlineTopic[]
  try {
    topics = await buildModuleOutline(job.userId, job.moduleId)
  } catch (error) {
    await fail(jobId, error instanceof Error ? error.message : "Outline build failed")
    throw error
  }
  if (topics.length === 0) {
    await fail(jobId, "No outline could be built — add materials and configure an AI model.")
    return
  }

  const modelRef = await resolveModelForUser(job.userId)
  if (!modelRef) {
    await fail(jobId, "No AI model configured.")
    return
  }
  const model = await getLanguageModel(modelRef, job.userId)
  const embeddingRef = (await getSetting("ai"))?.defaultEmbeddingModel ?? null

  const params = (job.params ?? {}) as GenParams
  const perTopic =
    params.perTopic ?? (job.kind === "deck" ? DEFAULT_CARDS_PER_TOPIC : DEFAULT_QUESTIONS_PER_TOPIC)
  const language = params.language ?? "the language of the source materials"
  const mixed = params.mixed ?? true

  // Seed de-dup with what the target already contains.
  const deduper = new Deduper(0.9)
  const existingKeys = await loadExistingKeys(job.kind, job.targetId)
  deduper.seedKeys(existingKeys)
  if (embeddingRef && existingKeys.length > 0) {
    deduper.seedVectors(await embedTexts(job.userId, embeddingRef, existingKeys))
  }

  const coverage = await db.query.generationCoverage.findMany({
    where: eq(generationCoverage.targetId, job.targetId),
  })
  const covByTopic = new Map(coverage.map((c) => [c.topicId, c]))

  await db
    .update(generationJob)
    .set({ topicsTotal: topics.length })
    .where(eq(generationJob.id, jobId))

  let topicsDone = 0
  let producedTotal = 0

  for (const topic of topics) {
    // Token-budget guard: stop cleanly at the monthly limit. Uncovered topics
    // stay pending, so a later run resumes exactly where this one stopped.
    try {
      await assertWithinLimit(job.userId)
    } catch {
      break
    }

    const existing = covByTopic.get(topic.id)
    if (existing?.status === "done") {
      topicsDone++
      producedTotal += existing.producedCount
      await db
        .update(generationJob)
        .set({ topicsDone, producedCount: producedTotal })
        .where(eq(generationJob.id, jobId))
      continue
    }

    await upsertCoverage(job.targetId, topic.id, jobId, "generating")
    let produced = 0
    try {
      const grounding = await groundTopic(job.userId, job.moduleId, topic)
      if (job.kind === "deck") {
        const cards = await generateTopicCards(
          job.userId,
          modelRef,
          model,
          job.targetId,
          topic,
          grounding,
          perTopic,
          language
        )
        const keys = cards.map((c) => c.front)
        const vecs =
          embeddingRef && keys.length > 0
            ? await embedTexts(job.userId, embeddingRef, keys)
            : undefined
        const fresh = deduper.filter(
          cards.map((c) => ({ key: c.front, item: c })),
          vecs
        )
        if (fresh.length > 0) {
          await db
            .insert(flashcard)
            .values(fresh.map((c) => ({ deckId: job.targetId, front: c.front, back: c.back })))
        }
        produced = fresh.length
      } else {
        const questions = await generateTopicQuestions(
          job.userId,
          modelRef,
          model,
          job.targetId,
          topic,
          grounding,
          perTopic,
          mixed,
          language
        )
        const keys = questions.map((q) => q.prompt)
        const vecs =
          embeddingRef && keys.length > 0
            ? await embedTexts(job.userId, embeddingRef, keys)
            : undefined
        const fresh = deduper.filter(
          questions.map((q) => ({ key: q.prompt, item: q })),
          vecs
        )
        if (fresh.length > 0) {
          const base = await nextQuizSortOrder(job.targetId)
          await db.insert(question).values(
            fresh.map((q, i) => ({
              quizId: job.targetId,
              kind: q.kind,
              prompt: q.prompt,
              options: q.kind === "multiple_choice" ? q.options : null,
              correctIndex:
                q.kind === "multiple_choice" && q.correctIndex >= 0 ? q.correctIndex : null,
              referenceAnswer: q.kind === "free_text" ? q.referenceAnswer : null,
              explanation: q.explanation || null,
              sortOrder: base + i,
            }))
          )
        }
        produced = fresh.length
      }
      await upsertCoverage(job.targetId, topic.id, jobId, "done", produced)
    } catch (error) {
      console.error("[generation] topic failed", topic.id, error)
      await upsertCoverage(job.targetId, topic.id, jobId, "failed")
    }

    topicsDone++
    producedTotal += produced
    await db
      .update(generationJob)
      .set({ topicsDone, producedCount: producedTotal })
      .where(eq(generationJob.id, jobId))
  }

  await db
    .update(generationJob)
    .set({ status: "completed", topicsDone, producedCount: producedTotal })
    .where(eq(generationJob.id, jobId))
}

// ---- Status -------------------------------------------------------------------

export type GenerationStatus = {
  id: string
  kind: GenerationKind
  targetId: string
  status: GenerationJobStatus
  topicsTotal: number
  topicsDone: number
  producedCount: number
  error: string | null
}

export async function getGenerationStatus(
  userId: string,
  jobId: string
): Promise<GenerationStatus | null> {
  const job = await db.query.generationJob.findFirst({
    where: and(eq(generationJob.id, jobId), eq(generationJob.userId, userId)),
  })
  if (!job) return null
  return {
    id: job.id,
    kind: job.kind,
    targetId: job.targetId,
    status: job.status,
    topicsTotal: job.topicsTotal,
    topicsDone: job.topicsDone,
    producedCount: job.producedCount,
    error: job.error,
  }
}
