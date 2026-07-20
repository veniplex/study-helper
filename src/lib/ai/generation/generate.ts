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
import { GEN_PARAMS, maxTokensForItems } from "@/lib/ai/params"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { runAi } from "@/lib/ai/run"
import { assertWithinLimit } from "@/lib/ai/usage"
import { getModuleMaterialSample, searchChunks, searchChunksInMaterials } from "@/lib/ai/rag"
import { buildModuleOutline, type OutlineTopic } from "./outline"
import { Deduper, embedTexts } from "./dedup"
import { resolveBatchProvider, submitBatch, toJsonSchema, type BatchItem } from "./batch-adapter"

const MAX_GROUNDING_CHARS = 12000
const DEFAULT_CARDS_PER_TOPIC = 6
const DEFAULT_QUESTIONS_PER_TOPIC = 4

export type GenParams = {
  perTopic?: number
  language?: string
  mixed?: boolean
  /** One-sentence exam-format hint so items mirror the module's assessment. */
  examContext?: string
}

export const cardSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })).max(60),
})

export const questionSchema = z.object({
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

/** The flashcard MAP prompt. Shared by the live path and the batch adapter so
 *  both produce identical output. */
export function buildCardPrompt(
  topic: OutlineTopic,
  grounding: string,
  count: number,
  language: string,
  examContext?: string
): string {
  return `Create up to ${count} high-quality spaced-repetition flashcards about the topic "${topic.title}".${
    topic.summary ? ` Topic scope: ${topic.summary}` : ""
  }${examContext ? `\n${examContext}` : ""}
Base the cards strictly on the excerpts below — do not invent facts not present.

Quality rubric:
- Atomic: each card tests exactly ONE fact, definition, distinction or step — never a list of several.
- The front is a specific question or term (not "Explain X" for a whole chapter); the back is the precise, complete answer in 1-3 sentences.
- Prefer why/how/compare cards over pure recall where the excerpts support it; skip trivia that no exam would ask.
- No card may be answerable from its own front text alone, and no two cards may test the same fact.
Write all cards in ${language}.

Excerpts:
${grounding || "(no excerpts available — use the topic title/scope)"}`
}

/** The quiz MAP prompt. Shared by the live path and the batch adapter. */
export function buildQuestionPrompt(
  topic: OutlineTopic,
  grounding: string,
  count: number,
  mixed: boolean,
  language: string,
  examContext?: string
): string {
  return `Create up to ${count} exam-style quiz questions about the topic "${topic.title}".${
    topic.summary ? ` Topic scope: ${topic.summary}` : ""
  }${examContext ? `\n${examContext}` : ""}
${mixed ? "Mix multiple_choice (exactly 4 plausible options, correctIndex set) and free_text (referenceAnswer set), about 70/30." : "Use only multiple_choice questions with exactly 4 plausible options and correctIndex set."}

Quality rubric:
- Vary difficulty: roughly half recall/understanding, half application/analysis (small scenarios, "which of these is NOT…", cause-effect).
- Multiple choice: all 4 options must be plausible and mutually exclusive; distractors reflect real misconceptions; avoid "all/none of the above"; distribute correctIndex evenly, never always the same position.
- Free text: the question must be answerable in 1-4 sentences and the referenceAnswer must contain every fact required for full credit.
- Base every question strictly on the excerpts; give each question a short explanation of the correct answer.
Write everything in ${language}.

Excerpts:
${grounding || "(no excerpts available — use the topic title/scope)"}`
}

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
  language: string,
  examContext?: string
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
        prompt: buildCardPrompt(topic, grounding, count, language, examContext),
        ...GEN_PARAMS,
        maxOutputTokens: maxTokensForItems(count),
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
  language: string,
  examContext?: string
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
        prompt: buildQuestionPrompt(topic, grounding, count, mixed, language, examContext),
        ...GEN_PARAMS,
        maxOutputTokens: maxTokensForItems(count),
      })
  )
  return object.questions.slice(0, count)
}

// ---- Coverage orchestration -----------------------------------------------------

export async function upsertCoverage(
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

export async function loadExistingKeys(kind: GenerationKind, targetId: string): Promise<string[]> {
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

type Card = z.infer<typeof cardSchema>["cards"][number]
type Question = z.infer<typeof questionSchema>["questions"][number]

/** De-duplicates generated cards against `deduper` and inserts the fresh ones.
 *  Shared by the live loop and the batch-result path. Returns items inserted. */
export async function persistCards(
  userId: string,
  targetId: string,
  deduper: Deduper,
  embeddingRef: string | null,
  cards: Card[]
): Promise<number> {
  const keys = cards.map((c) => c.front)
  const vecs =
    embeddingRef && keys.length > 0 ? await embedTexts(userId, embeddingRef, keys) : undefined
  const fresh = deduper.filter(
    cards.map((c) => ({ key: c.front, item: c })),
    vecs
  )
  if (fresh.length > 0) {
    await db
      .insert(flashcard)
      .values(fresh.map((c) => ({ deckId: targetId, front: c.front, back: c.back })))
  }
  return fresh.length
}

/** De-duplicates generated questions against `deduper` and inserts the fresh
 *  ones. Shared by the live loop and the batch-result path. Returns items
 *  inserted. */
export async function persistQuestions(
  userId: string,
  targetId: string,
  deduper: Deduper,
  embeddingRef: string | null,
  questions: Question[]
): Promise<number> {
  // A multiple-choice question whose answer key can't point at one of its own
  // options is unanswerable — drop it rather than persisting a broken quiz item.
  const valid = questions.filter(
    (q) =>
      q.kind !== "multiple_choice" ||
      (q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
  )
  if (valid.length < questions.length) {
    console.warn(`[generation] dropped ${questions.length - valid.length} invalid MC question(s)`)
  }
  const keys = valid.map((q) => q.prompt)
  const vecs =
    embeddingRef && keys.length > 0 ? await embedTexts(userId, embeddingRef, keys) : undefined
  const fresh = deduper.filter(
    valid.map((q) => ({ key: q.prompt, item: q })),
    vecs
  )
  if (fresh.length > 0) {
    const base = await nextQuizSortOrder(targetId)
    await db.insert(question).values(
      fresh.map((q, i) => ({
        quizId: targetId,
        kind: q.kind,
        prompt: q.prompt,
        options: q.kind === "multiple_choice" ? q.options : null,
        correctIndex: q.kind === "multiple_choice" && q.correctIndex >= 0 ? q.correctIndex : null,
        referenceAnswer: q.kind === "free_text" ? q.referenceAnswer : null,
        explanation: q.explanation || null,
        sortOrder: base + i,
      }))
    )
  }
  return fresh.length
}

async function fail(jobId: string, message: string): Promise<void> {
  await db
    .update(generationJob)
    .set({ status: "failed", error: message.slice(0, 500) })
    .where(eq(generationJob.id, jobId))
}

/** Marks a batch submit that was started but not yet confirmed — see
 *  trySubmitBatchGeneration. Never a real vendor batch id. */
export const SUBMIT_MARKER_PREFIX = "submitting:"

/** Batch-request token budget per topic (Anthropic requires max_tokens). */
function batchMaxTokens(count: number): number {
  return maxTokensForItems(count)
}

/**
 * Submits all uncovered topics as ONE provider batch for the MAP step and marks
 * the job as awaiting the batch (status stays `running`, `batchRef` set). Returns
 * true when a batch was submitted (or there was nothing left to do) — the caller
 * then returns and the batch poller finishes the job once results arrive. Returns
 * false to fall back to the live path (provider not batch-capable, or submit
 * failed). Grounding/retrieval still runs live here; only the LLM calls batch.
 */
async function trySubmitBatchGeneration(
  job: typeof generationJob.$inferSelect,
  topics: OutlineTopic[],
  modelRef: string,
  covByTopic: Map<string, typeof generationCoverage.$inferSelect>,
  opts: { perTopic: number; language: string; mixed: boolean; examContext?: string }
): Promise<boolean> {
  const provider = await resolveBatchProvider(modelRef, job.userId)
  if (!provider) return false

  const pending = topics.filter((t) => covByTopic.get(t.id)?.status !== "done")
  const doneRows = topics.filter((t) => covByTopic.get(t.id)?.status === "done")
  const alreadyProduced = doneRows.reduce(
    (sum, t) => sum + (covByTopic.get(t.id)?.producedCount ?? 0),
    0
  )

  if (pending.length === 0) {
    await db
      .update(generationJob)
      .set({ status: "completed", topicsDone: doneRows.length, producedCount: alreadyProduced })
      .where(eq(generationJob.id, job.id))
    return true
  }

  try {
    await assertWithinLimit(job.userId)
  } catch {
    await fail(job.id, "Monthly token limit reached")
    return true
  }

  const jsonSchema = toJsonSchema(job.kind === "deck" ? cardSchema : questionSchema)
  const maxTokens = batchMaxTokens(opts.perTopic)

  const items: BatchItem[] = []
  for (const topic of pending) {
    const grounding = await groundTopic(job.userId, job.moduleId, topic)
    const prompt =
      job.kind === "deck"
        ? buildCardPrompt(topic, grounding, opts.perTopic, opts.language, opts.examContext)
        : buildQuestionPrompt(
            topic,
            grounding,
            opts.perTopic,
            opts.mixed,
            opts.language,
            opts.examContext
          )
    items.push({ customId: topic.id, prompt, jsonSchema, maxTokens })
    await upsertCoverage(job.targetId, topic.id, job.id, "generating")
  }

  // submitBatch spends money before its id can be stored. Persist a marker
  // first: if the worker dies in that window, the retried run sees the marker
  // and stops (see runCoverageGeneration) instead of paying for a second batch
  // while the first one keeps running at the vendor, uningested.
  const attemptRef = `${SUBMIT_MARKER_PREFIX}${crypto.randomUUID()}`
  await db
    .update(generationJob)
    .set({ batchRef: attemptRef, batchModel: modelRef })
    .where(eq(generationJob.id, job.id))

  let batchRef: string
  try {
    batchRef = await submitBatch(provider, items)
  } catch (error) {
    console.error("[generation] batch submit failed, falling back to live path", error)
    await db
      .update(generationJob)
      .set({ batchRef: null, batchModel: null })
      .where(eq(generationJob.id, job.id))
    return false
  }

  await db
    .update(generationJob)
    .set({
      batchRef,
      batchModel: modelRef,
      topicsDone: doneRows.length,
      producedCount: alreadyProduced,
    })
    .where(eq(generationJob.id, job.id))
  return true
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
  // "applying": a batch poller is ingesting this job's results right now — a
  // retried generate-coverage run must not restart it underneath the poller.
  if (
    !job ||
    job.status === "completed" ||
    job.status === "canceled" ||
    job.status === "applying"
  ) {
    return
  }

  // A submit marker means the previous run died between paying for a batch and
  // storing its id — we can't tell whether the vendor accepted it, so stop here
  // rather than risk a second charge. Restarting is the user's call.
  if (job.batchRef?.startsWith(SUBMIT_MARKER_PREFIX)) {
    await db
      .update(generationJob)
      .set({
        status: "failed",
        error: "Batch submit was interrupted — start the generation again.",
        batchRef: null,
        batchModel: null,
      })
      .where(eq(generationJob.id, jobId))
    return
  }

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
  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel ?? null

  const params = (job.params ?? {}) as GenParams
  const perTopic =
    params.perTopic ?? (job.kind === "deck" ? DEFAULT_CARDS_PER_TOPIC : DEFAULT_QUESTIONS_PER_TOPIC)
  const language = params.language ?? "the language of the source materials"
  const mixed = params.mixed ?? true
  const examContext = params.examContext

  const coverage = await db.query.generationCoverage.findMany({
    where: eq(generationCoverage.targetId, job.targetId),
  })
  const covByTopic = new Map(coverage.map((c) => [c.topicId, c]))

  await db
    .update(generationJob)
    .set({ topicsTotal: topics.length })
    .where(eq(generationJob.id, jobId))

  // Optional: run the per-topic MAP step through the provider's async Batch API
  // (~50% cheaper). Submits one batch for all uncovered topics and returns; the
  // batch poller records the results (with tokens + audit) and completes the job
  // when the batch finishes. Falls through to the live path when the flag is off
  // or the active provider isn't batch-capable.
  if (ai?.useBatchApi) {
    const submitted = await trySubmitBatchGeneration(job, topics, modelRef, covByTopic, {
      perTopic,
      language,
      mixed,
      examContext,
    })
    if (submitted) return
  }

  // Live path: seed de-dup with what the target already contains, then iterate.
  const deduper = new Deduper(0.9)
  const existingKeys = await loadExistingKeys(job.kind, job.targetId)
  deduper.seedKeys(existingKeys)
  if (embeddingRef && existingKeys.length > 0) {
    deduper.seedVectors(await embedTexts(job.userId, embeddingRef, existingKeys))
  }

  let topicsDone = 0
  let producedTotal = 0
  let cappedOut = false

  for (const topic of topics) {
    // Token-budget guard: stop cleanly at the monthly limit. Uncovered topics
    // stay pending, so a later run resumes exactly where this one stopped.
    try {
      await assertWithinLimit(job.userId)
    } catch {
      cappedOut = true
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
          language,
          examContext
        )
        produced = await persistCards(job.userId, job.targetId, deduper, embeddingRef, cards)
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
          language,
          examContext
        )
        produced = await persistQuestions(
          job.userId,
          job.targetId,
          deduper,
          embeddingRef,
          questions
        )
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

  // The run stays "completed" (unlike the batch path, which aborts before
  // producing anything) because the topics it did finish are real items — but
  // it carries the reason, so a deck cut short by the cap isn't mistaken for
  // the finished result.
  await db
    .update(generationJob)
    .set({
      status: "completed",
      topicsDone,
      producedCount: producedTotal,
      error: cappedOut ? "Monthly token limit reached — not all topics were generated." : null,
    })
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
