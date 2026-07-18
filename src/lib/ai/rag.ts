import "server-only"
import { embed, embedMany } from "ai"
import { and, eq, inArray, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { material, materialChunk, type ExtractionStatus } from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { deleteFile, readStoredText, saveText } from "@/lib/storage"
import { getEmbeddingModel } from "./registry"
import { recordAiAudit, runAi } from "./run"
import { extractText } from "./extract"
import { annDimensionFor, populateAnn } from "./ann"

/** Bounded preview of extracted text kept in the DB for quick ILIKE search. */
const PREVIEW_CHARS = 200_000
/** How many chunks to embed per provider call. */
const EMBED_BATCH = 96

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

export function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
  if (!normalized) return []
  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length)
    if (end < normalized.length) {
      // prefer to break at a paragraph or sentence boundary
      const slice = normalized.slice(start, end)
      const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "))
      if (breakAt > CHUNK_SIZE * 0.5) end = start + breakAt + 1
    }
    chunks.push(normalized.slice(start, end).trim())
    if (end >= normalized.length) break
    start = end - CHUNK_OVERLAP
  }
  return chunks.filter((c) => c.length > 20)
}

async function setStatus(
  materialId: string,
  status: ExtractionStatus,
  extra: { extractionError?: string | null } = {}
): Promise<void> {
  await db
    .update(material)
    .set({ extractionStatus: status, ...extra })
    .where(eq(material.id, materialId))
}

/**
 * Extracts text, chunks and embeds a material. Idempotent and resumable:
 * - text is extracted once and stored on disk (`textStoragePath`); re-runs reuse
 *   it instead of re-OCR-ing / re-transcribing (which cost tokens),
 * - embedding runs in bounded batches, skipping chunks already embedded for the
 *   active model, so a retried job resumes where it left off.
 * Extraction always runs (feeds search); embedding only when a default embedding
 * model is configured.
 */
export async function processMaterial(materialId: string): Promise<void> {
  const row = await db.query.material.findFirst({ where: eq(material.id, materialId) })
  if (!row || row.kind !== "file" || !row.storagePath) return

  try {
    const { text, skipReason } = await ensureExtractedText(row)
    if (text == null) {
      await setStatus(materialId, "skipped", { extractionError: skipReason ?? null })
      return
    }

    const ai = await getSetting("ai")
    const embeddingRef = ai?.defaultEmbeddingModel
    if (!embeddingRef) {
      await setStatus(materialId, "ready")
      return
    }

    // Contextual retrieval: situate each chunk in its document (title + summary
    // when available) so ambiguous chunks retrieve better.
    const contextHeader = [row.name, row.summary].filter(Boolean).join(" — ").slice(0, 500)
    await embedMaterialText(row.userId, materialId, text, embeddingRef, contextHeader)
    await setStatus(materialId, "ready")
  } catch (error) {
    console.error("[rag] processMaterial failed", materialId, error)
    await setStatus(materialId, "failed", {
      extractionError:
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    })
    throw error
  }
}

/**
 * Returns the material's full extracted text, reusing the on-disk copy when the
 * content is unchanged. On first extraction the full text is written to disk and
 * a bounded preview + char count are stored on the row (so multi-GB documents
 * are not capped by a single DB column, and re-runs don't re-extract).
 */
async function ensureExtractedText(
  row: typeof material.$inferSelect
): Promise<{ text: string | null; skipReason?: string }> {
  if (row.textStoragePath && row.charCount != null) {
    try {
      return { text: await readStoredText(row.textStoragePath) }
    } catch {
      // stored text missing — fall through and re-extract
    }
  }

  await setStatus(row.id, "extracting")
  let text = await extractText(row.storagePath!, row.mimeType)
  let skipReason: string | undefined
  if (!text) {
    // Media without extractable text: OCR images, transcribe audio/video.
    // When the capability is missing we record WHY, so the material doesn't
    // just silently show up as "skipped" with no explanation.
    const { classifyFile } = await import("./filetypes")
    const strategy = classifyFile(row.storagePath!, row.mimeType)
    if (strategy === "image") {
      const { resolveModelForUser } = await import("./registry")
      if (!(await resolveModelForUser(row.userId))) {
        skipReason = "No AI model configured — image text (OCR) was not extracted."
      } else {
        const { extractImageText } = await import("./media")
        text = await extractImageText(row.storagePath!, row.mimeType, row.userId)
        if (!text) skipReason = "OCR returned no text (the configured model may not support images)."
      }
    } else if (strategy === "audio") {
      const { getTranscriptionModel } = await import("./registry")
      if (!(await getTranscriptionModel(row.userId))) {
        skipReason =
          "No transcription model available — audio/video needs an OpenAI or Groq provider."
      } else {
        const { transcribeMedia } = await import("./media")
        text = await transcribeMedia(row.storagePath!, row.userId)
        if (!text) skipReason = "Transcription returned no text."
      }
    } else {
      skipReason = "No extractable text in this file type."
    }
  }
  if (!text) return { text: null, skipReason }

  const textStoragePath = await saveText(row.userId, `${row.id}.txt`, text)
  const previous = row.textStoragePath
  await db
    .update(material)
    .set({ textStoragePath, charCount: text.length, textContent: text.slice(0, PREVIEW_CHARS) })
    .where(eq(material.id, row.id))
  if (previous && previous !== textStoragePath) await deleteFile(previous)
  return { text }
}

/** Chunks and embeds a material's text incrementally (batched, resumable). */
async function embedMaterialText(
  userId: string,
  materialId: string,
  text: string,
  embeddingRef: string,
  contextHeader = ""
): Promise<void> {
  const chunks = chunkText(text)
  await db
    .update(material)
    .set({ extractionStatus: "embedding", chunksTotal: chunks.length, chunksEmbedded: 0 })
    .where(eq(material.id, materialId))
  if (chunks.length === 0) return

  // Which leaf chunks are already embedded for the active model? (resumability)
  const existing = await db
    .select({ chunkIndex: materialChunk.chunkIndex })
    .from(materialChunk)
    .where(
      and(
        eq(materialChunk.materialId, materialId),
        eq(materialChunk.embeddingModel, embeddingRef),
        eq(materialChunk.level, 0)
      )
    )
  const done = new Set(existing.map((e) => e.chunkIndex))
  // If the chunk layout changed (e.g. chunker tuning), redo this model's chunks.
  if (done.size > 0 && done.size !== chunks.length) {
    await db
      .delete(materialChunk)
      .where(
        and(
          eq(materialChunk.materialId, materialId),
          eq(materialChunk.embeddingModel, embeddingRef),
          eq(materialChunk.level, 0)
        )
      )
    done.clear()
  }

  const model = await getEmbeddingModel(embeddingRef, userId)
  let embeddedCount = done.size
  let totalInput = 0
  let newlyEmbedded = 0

  for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
    const idxs: number[] = []
    const values: string[] = []
    for (let i = start; i < Math.min(start + EMBED_BATCH, chunks.length); i++) {
      if (done.has(i)) continue
      idxs.push(i)
      values.push(chunks[i])
    }
    if (values.length === 0) continue

    // Embed the contextualized text (header + chunk); store the raw chunk.
    const embedInputs = contextHeader ? values.map((v) => `${contextHeader}\n\n${v}`) : values
    const { embeddings, aiUsage } = await runAi(
      {
        userId,
        model: embeddingRef,
        feature: "embedding",
        operation: "ai_embed",
        entityType: "material",
        entityId: materialId,
        audit: false, // one aggregated audit entry per material (below)
      },
      () => embedMany({ model, values: embedInputs })
    )
    totalInput += aiUsage.inputTokens
    newlyEmbedded += values.length

    await db.insert(materialChunk).values(
      idxs.map((idx, k) => ({
        materialId,
        chunkIndex: idx,
        content: chunks[idx],
        embedding: embeddings[k],
        embeddingModel: embeddingRef,
        level: 0,
        contextualHeader: contextHeader || null,
      }))
    )
    embeddedCount += values.length
    await db
      .update(material)
      .set({ chunksEmbedded: embeddedCount })
      .where(eq(material.id, materialId))
  }

  if (newlyEmbedded > 0) {
    await recordAiAudit(
      {
        userId,
        model: embeddingRef,
        feature: "embedding",
        operation: "ai_embed",
        entityType: "material",
        entityId: materialId,
        itemCount: newlyEmbedded,
      },
      { inputTokens: totalInput, outputTokens: 0, totalTokens: totalInput }
    )
  }

  // Keep the ANN index column current (no-op unless an admin built it).
  await populateAnn(materialId, embeddingRef)
}

export type RagHit = {
  content: string
  materialName: string
  materialId: string
  similarity: number
}

type ScoredRow = {
  id: string
  content: string
  materialName: string
  materialId: string
  similarity: number
}

/**
 * Reciprocal Rank Fusion of a vector ranking and a lexical ranking. Each list
 * contributes 1/(K+rank); items appearing in both rise to the top. This makes
 * retrieval robust to the vector model missing exact terms/acronyms/formulae
 * (which lexical catches) and vice-versa.
 */
/**
 * Vector-only hits below this cosine similarity are cut before fusion: nearest-
 * neighbour search always returns *something*, even for a query the corpus
 * doesn't cover, and those noise chunks would otherwise flow into prompts.
 * Deliberately conservative (clearly-unrelated territory across common
 * embedding models); hits that also match lexically are never cut — a term
 * match is real signal regardless of the cosine value.
 */
const MIN_VECTOR_SIMILARITY = 0.15

function rrfFuse(
  vector: ScoredRow[],
  lexical: Omit<ScoredRow, "similarity">[],
  limit: number
): RagHit[] {
  const K = 60
  const lexicalIds = new Set(lexical.map((r) => r.id))
  vector = vector.filter(
    (r) => r.similarity >= MIN_VECTOR_SIMILARITY || lexicalIds.has(r.id)
  )
  const acc = new Map<string, { hit: RagHit; score: number }>()
  vector.forEach((r, i) => {
    acc.set(r.id, {
      hit: {
        content: r.content,
        materialName: r.materialName,
        materialId: r.materialId,
        similarity: r.similarity,
      },
      score: 1 / (K + i + 1),
    })
  })
  lexical.forEach((r, i) => {
    const s = 1 / (K + i + 1)
    const existing = acc.get(r.id)
    if (existing) existing.score += s
    else
      acc.set(r.id, {
        hit: {
          content: r.content,
          materialName: r.materialName,
          materialId: r.materialId,
          similarity: 0,
        },
        score: s,
      })
  })
  return [...acc.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.hit)
}

/** Hybrid (vector + full-text) retrieval fused with RRF. */
async function hybridSearch(
  userId: string,
  query: string,
  extraWhere: SQL[],
  limit: number
): Promise<RagHit[]> {
  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel
  if (!embeddingRef) return []
  const pool = Math.max(limit * 4, 24)
  const base = and(eq(material.userId, userId), ...extraWhere)

  // Lexical ranking via Postgres full-text search over the generated tsvector.
  // websearch_to_tsquery never throws on arbitrary (user/model-supplied) query
  // strings and supports quoted phrases. Config MUST match the generated
  // column's config (schema/material-chunks.ts) or stemming mismatches kill
  // recall despite the GIN index.
  const tsq = sql`websearch_to_tsquery('german', ${query})`
  const lexical = await db
    .select({
      id: materialChunk.id,
      content: materialChunk.content,
      materialName: material.name,
      materialId: material.id,
    })
    .from(materialChunk)
    .innerJoin(material, eq(materialChunk.materialId, material.id))
    .where(and(base, sql`${materialChunk.contentTsv} @@ ${tsq}`))
    .orderBy(sql`ts_rank(${materialChunk.contentTsv}, ${tsq}) DESC`)
    .limit(pool)

  // Vector (cosine) ranking — uses the HNSW ANN column when an admin has built
  // it for the active model, otherwise the dimensionless sequential scan.
  const annDim = await annDimensionFor(embeddingRef)
  const model = await getEmbeddingModel(embeddingRef, userId)
  const { embedding } = await runAi(
    {
      userId,
      model: embeddingRef,
      feature: "embedding-query",
      operation: "ai_embed",
      audit: false, // retrieval happens constantly — ledger only, no audit spam
    },
    () => embed({ model, value: query })
  )
  const vectorLiteral = `[${embedding.join(",")}]`
  const embCol = annDim ? sql.raw("material_chunk.embedding_hnsw") : sql`${materialChunk.embedding}`
  const distExpr = sql`${embCol} <=> ${vectorLiteral}::vector`
  const vectorWhere = annDim
    ? and(base, eq(materialChunk.embeddingModel, embeddingRef), sql`${embCol} IS NOT NULL`)
    : and(base, eq(materialChunk.embeddingModel, embeddingRef))
  const vector = await db
    .select({
      id: materialChunk.id,
      content: materialChunk.content,
      materialName: material.name,
      materialId: material.id,
      similarity: sql<number>`1 - (${distExpr})`,
    })
    .from(materialChunk)
    .innerJoin(material, eq(materialChunk.materialId, material.id))
    .where(vectorWhere)
    .orderBy(distExpr)
    .limit(pool)

  return rrfFuse(vector, lexical, limit)
}

/** Hybrid (vector + lexical, RRF-fused) search over the user's material chunks. */
export async function searchChunks(
  userId: string,
  query: string,
  options: { moduleId?: string | null; limit?: number } = {}
): Promise<RagHit[]> {
  const extra = options.moduleId ? [eq(material.moduleId, options.moduleId)] : []
  return hybridSearch(userId, query, extra, options.limit ?? 6)
}

/**
 * Hybrid search scoped to specific materials (topic grounding). Used by
 * coverage-driven generation to pull substantial, focused context for one topic
 * across exactly the materials that back it — far more than the global top-k the
 * interactive path uses. Searches leaf chunks (level 0) only.
 */
export async function searchChunksInMaterials(
  userId: string,
  query: string,
  materialIds: string[],
  options: { limit?: number } = {}
): Promise<RagHit[]> {
  if (materialIds.length === 0) return []
  return hybridSearch(
    userId,
    query,
    [inArray(materialChunk.materialId, materialIds), eq(materialChunk.level, 0)],
    options.limit ?? 16
  )
}

/**
 * Falls back to raw excerpts from the module's materials when semantic
 * search finds nothing usable (no embedding model configured, or the query
 * text — e.g. a generic deck/quiz name — doesn't match anything). Ensures
 * generation always has something concrete to ground on instead of
 * inventing unrelated content.
 */
export async function getModuleMaterialSample(
  userId: string,
  moduleId: string,
  options: { maxMaterials?: number; maxCharsPerMaterial?: number } = {}
): Promise<RagHit[]> {
  const rows = await db.query.material.findMany({
    where: and(eq(material.userId, userId), eq(material.moduleId, moduleId)),
    columns: { id: true, name: true, textContent: true },
    limit: options.maxMaterials ?? 4,
  })
  return rows
    .filter((r) => r.textContent)
    .map((r) => ({
      content: r.textContent!.slice(0, options.maxCharsPerMaterial ?? 1500),
      materialName: r.name,
      materialId: r.id,
      similarity: 0,
    }))
}
