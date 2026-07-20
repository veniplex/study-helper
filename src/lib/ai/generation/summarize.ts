import "server-only"
import { GEN_PARAMS } from "@/lib/ai/params"
import { generateText, embedMany } from "ai"
import { and, asc, eq, gt } from "drizzle-orm"
import { db } from "@/db"
import { material, materialChunk } from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { readStoredText } from "@/lib/storage"
import { getEmbeddingModel, getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { recordAiAudit, runAi, type AiUsage } from "@/lib/ai/run"
import { isOverLimit } from "@/lib/ai/usage"
import { chunkText } from "@/lib/ai/rag"
import { populateAnn } from "@/lib/ai/ann"

/** Leaf chunks grouped per section-summary call. */
const SECTION_UNITS = 20
/** Fan-in when rolling section summaries up into the document summary. */
const REDUCE_FANOUT = 20
/** Cap the stored document summary length. */
const DOC_SUMMARY_CHARS = 8000

const SECTION_PROMPT = (excerpt: string) =>
  `Summarize the following excerpt from a study material as a concise, faithful set of bullet points that captures every key concept, definition, term, formula and fact a student must learn from it. Be specific; do not invent or generalize beyond the text. Write in the same language as the excerpt.\n\nExcerpt:\n${excerpt}`

const REDUCE_PROMPT = (parts: string[]) =>
  `Combine these partial summaries of one document into a single coherent study summary of the WHOLE document. Preserve every distinct topic and subtopic as a structured nested bullet list (main topics with sub-bullets). Do not drop topics and do not add new ones. Write in the same language as the input.\n\nPartial summaries:\n${parts.map((p, i) => `--- Part ${i + 1} ---\n${p}`).join("\n\n")}`

function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

/**
 * Groups a material's text into sections (~SECTION_UNITS chunks each), preferring
 * the already-embedded leaf chunks; falls back to re-chunking the stored full
 * text when no chunks exist (e.g. no embedding model configured).
 */
async function getSectionTexts(row: typeof material.$inferSelect): Promise<string[]> {
  let units: string[] = []
  const leaves = await db
    .select({ content: materialChunk.content })
    .from(materialChunk)
    .where(and(eq(materialChunk.materialId, row.id), eq(materialChunk.level, 0)))
    .orderBy(asc(materialChunk.chunkIndex))
  if (leaves.length > 0) {
    units = leaves.map((l) => l.content)
  } else if (row.textStoragePath) {
    try {
      units = chunkText(await readStoredText(row.textStoragePath))
    } catch {
      units = []
    }
  }
  if (units.length === 0) return []

  const sections: string[] = []
  for (let i = 0; i < units.length; i += SECTION_UNITS) {
    sections.push(units.slice(i, i + SECTION_UNITS).join("\n\n"))
  }
  return sections
}

/** Persists summary nodes as level-1 material_chunk rows (embedded if possible). */
async function storeSummaryChunks(
  row: typeof material.$inferSelect,
  summaries: string[],
  embeddingRef: string | undefined,
  accUsage: (u: AiUsage) => void
): Promise<void> {
  // Replace any previous summary nodes for this material.
  await db
    .delete(materialChunk)
    .where(and(eq(materialChunk.materialId, row.id), gt(materialChunk.level, 0)))
  if (summaries.length === 0) return

  let embeddings: number[][] | null = null
  if (embeddingRef) {
    const model = await getEmbeddingModel(embeddingRef, row.userId)
    const { embeddings: emb, aiUsage } = await runAi(
      {
        userId: row.userId,
        model: embeddingRef,
        feature: "embedding",
        operation: "ai_embed",
        entityType: "material",
        entityId: row.id,
        audit: false,
      },
      () => embedMany({ model, values: summaries })
    )
    embeddings = emb
    accUsage(aiUsage)
  }

  await db.insert(materialChunk).values(
    summaries.map((content, i) => ({
      materialId: row.id,
      chunkIndex: i,
      content,
      embedding: embeddings ? embeddings[i] : null,
      embeddingModel: embeddings ? embeddingRef : null,
      level: 1,
    }))
  )
}

/** True when the material still has its retrievable level-1 summary nodes. */
async function hasSummaryChunks(materialId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: materialChunk.id })
    .from(materialChunk)
    .where(and(eq(materialChunk.materialId, materialId), gt(materialChunk.level, 0)))
    .limit(1)
  return existing != null
}

/**
 * Builds a hierarchical (RAPTOR-lite) summary of a material: a summary per
 * section, rolled up into one document summary. Section summaries are stored as
 * level-1 chunks (retrievable); the document summary is stored on
 * `material.summary` and feeds the module outline. Idempotent: skips when both
 * parts already exist (content is immutable per material). Best-effort — a
 * missing language model just means no summary (graceful degradation).
 */
export async function summarizeMaterial(materialId: string): Promise<void> {
  const row = await db.query.material.findFirst({ where: eq(material.id, materialId) })
  if (!row || row.kind !== "file") return

  // The two halves can go missing independently: an embedding-model switch
  // deletes every chunk row of the old model (reembed.ts), which takes the
  // level-1 summary nodes with it while `material.summary` survives. Skipping on
  // `summary` alone would drop those nodes out of retrieval permanently, so
  // rebuild them — the doc summary text itself stays valid for this (immutable)
  // content and needs no second reduce pass.
  const needsReduce = !row.summary
  if (!needsReduce && (await hasSummaryChunks(materialId))) return

  // Summarization is the most expensive background pass (one model call per
  // section plus the reduce rounds), so it has to respect the monthly cap like
  // embedding/OCR/transcription do. Leave the status untouched: processMaterial
  // has already recorded why this material stopped short, and the material stays
  // retryable once the user is back under the limit.
  if (await isOverLimit(row.userId)) return

  const modelRef = await resolveModelForUser(row.userId)
  if (!modelRef) return

  const sections = await getSectionTexts(row)
  if (sections.length === 0) return

  await db
    .update(material)
    .set({ extractionStatus: "summarizing" })
    .where(eq(material.id, materialId))

  try {
    await runSummarization(row, materialId, modelRef, needsReduce)
  } catch (error) {
    // Summaries are best-effort — never leave the material stuck in
    // "summarizing" (an eternal spinner in the UI) because of a model error.
    await db.update(material).set({ extractionStatus: "ready" }).where(eq(material.id, materialId))
    throw error
  }
}

async function runSummarization(
  row: typeof material.$inferSelect,
  materialId: string,
  modelRef: string,
  /** False when only the level-1 nodes are being rebuilt — the stored doc
   *  summary is still valid, so the reduce rounds are skipped (and not paid). */
  reduce: boolean
): Promise<void> {
  const sections = await getSectionTexts(row)
  const model = await getLanguageModel(modelRef, row.userId)
  let usage: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const acc = (u: AiUsage) => {
    usage = addUsage(usage, u)
  }

  // MAP: summarize each section.
  const sectionSummaries: string[] = []
  for (const section of sections) {
    const { text, aiUsage } = await runAi(
      {
        userId: row.userId,
        model: modelRef,
        feature: "summary-section",
        operation: "ai_summarize",
        entityType: "material",
        entityId: materialId,
        entityLabel: row.name,
        audit: false,
      },
      () => generateText({ model, prompt: SECTION_PROMPT(section), ...GEN_PARAMS })
    )
    acc(aiUsage)
    const trimmed = text.trim()
    if (trimmed) sectionSummaries.push(trimmed)
  }
  if (sectionSummaries.length === 0) {
    await db.update(material).set({ extractionStatus: "ready" }).where(eq(material.id, materialId))
    return
  }

  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel
  await storeSummaryChunks(row, sectionSummaries, embeddingRef, acc)
  if (embeddingRef) await populateAnn(row.id, embeddingRef)

  if (!reduce) {
    await db.update(material).set({ extractionStatus: "ready" }).where(eq(material.id, materialId))
    await recordSummaryAudit(row, materialId, modelRef, sections.length, usage)
    return
  }

  // REDUCE: roll section summaries up into a single document summary.
  let docSummary = sectionSummaries[0]
  let parts = sectionSummaries
  while (parts.length > 1) {
    const next: string[] = []
    for (let i = 0; i < parts.length; i += REDUCE_FANOUT) {
      const group = parts.slice(i, i + REDUCE_FANOUT)
      if (group.length === 1) {
        next.push(group[0])
        continue
      }
      const { text, aiUsage } = await runAi(
        {
          userId: row.userId,
          model: modelRef,
          feature: "summary-doc",
          operation: "ai_summarize",
          entityType: "material",
          entityId: materialId,
          entityLabel: row.name,
          audit: false,
        },
        () => generateText({ model, prompt: REDUCE_PROMPT(group), ...GEN_PARAMS })
      )
      acc(aiUsage)
      next.push(text.trim())
    }
    parts = next
    docSummary = next[0]
  }

  await db
    .update(material)
    .set({ summary: docSummary.slice(0, DOC_SUMMARY_CHARS), extractionStatus: "ready" })
    .where(eq(material.id, materialId))

  await recordSummaryAudit(row, materialId, modelRef, sections.length, usage)
}

function recordSummaryAudit(
  row: typeof material.$inferSelect,
  materialId: string,
  modelRef: string,
  itemCount: number,
  usage: AiUsage
): Promise<void> {
  return recordAiAudit(
    {
      userId: row.userId,
      model: modelRef,
      feature: "summary",
      operation: "ai_summarize",
      entityType: "material",
      entityId: materialId,
      entityLabel: row.name,
      itemCount,
    },
    usage
  )
}
