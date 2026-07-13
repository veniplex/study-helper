import "server-only"
import { embed, embedMany } from "ai"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { material, materialChunk } from "@/db/schema"
import { getSetting } from "@/lib/settings"
import { getEmbeddingModel } from "./registry"
import { extractText } from "./extract"

const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()
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

/**
 * Extracts text, chunks and embeds a material. Extraction always runs (feeds
 * full-text search); embedding only when a default embedding model is set.
 */
export async function processMaterial(materialId: string): Promise<void> {
  const row = await db.query.material.findFirst({ where: eq(material.id, materialId) })
  if (!row || row.kind !== "file" || !row.storagePath) return

  const text = await extractText(row.storagePath, row.mimeType)
  if (!text) return

  await db
    .update(material)
    .set({ textContent: text.slice(0, 500_000) })
    .where(eq(material.id, materialId))

  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel
  if (!embeddingRef) return

  const chunks = chunkText(text)
  if (chunks.length === 0) return

  const model = await getEmbeddingModel(embeddingRef, row.userId)
  const { embeddings } = await embedMany({ model, values: chunks })

  await db.delete(materialChunk).where(eq(materialChunk.materialId, materialId))
  await db.insert(materialChunk).values(
    chunks.map((content, i) => ({
      materialId,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
      embeddingModel: embeddingRef,
    }))
  )
}

export type RagHit = {
  content: string
  materialName: string
  materialId: string
  similarity: number
}

/** Cosine-similarity search over the user's material chunks. */
export async function searchChunks(
  userId: string,
  query: string,
  options: { moduleId?: string | null; limit?: number } = {}
): Promise<RagHit[]> {
  const ai = await getSetting("ai")
  const embeddingRef = ai?.defaultEmbeddingModel
  if (!embeddingRef) return []

  const model = await getEmbeddingModel(embeddingRef, userId)
  const { embedding } = await embed({ model, value: query })
  const vectorLiteral = `[${embedding.join(",")}]`

  const rows = await db
    .select({
      content: materialChunk.content,
      materialName: material.name,
      materialId: material.id,
      similarity: sql<number>`1 - (${materialChunk.embedding} <=> ${vectorLiteral}::vector)`,
    })
    .from(materialChunk)
    .innerJoin(material, eq(materialChunk.materialId, material.id))
    .where(
      and(
        eq(material.userId, userId),
        eq(materialChunk.embeddingModel, embeddingRef),
        ...(options.moduleId ? [eq(material.moduleId, options.moduleId)] : [])
      )
    )
    .orderBy(sql`${materialChunk.embedding} <=> ${vectorLiteral}::vector`)
    .limit(options.limit ?? 6)

  return rows
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
