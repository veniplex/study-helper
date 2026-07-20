import "server-only"
import { embedMany } from "ai"
import { getEmbeddingModel } from "@/lib/ai/registry"
import { runAi } from "@/lib/ai/run"

export type DedupItem<T> = { key: string; item: T }

/** Normalized comparison key (case/punctuation/whitespace-insensitive). */
export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    // i < n = min(a.length, b.length), so both entries exist.
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    na += ai * ai
    nb += bi * bi
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Embeds texts through the usage-logged wrapper (no audit spam). */
export async function embedTexts(
  userId: string,
  embeddingRef: string,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return []
  const model = await getEmbeddingModel(embeddingRef, userId)
  const { embeddings } = await runAi(
    {
      userId,
      model: embeddingRef,
      feature: "embedding-dedup",
      operation: "ai_embed",
      audit: false,
    },
    () => embedMany({ model, values: texts })
  )
  return embeddings
}

/**
 * Accumulating de-duplicator across a whole coverage run: rejects items whose
 * normalized key was already seen, and (when vectors are supplied) items that
 * are semantically near-duplicates of anything accepted so far. This keeps the
 * generated set free of repetition even though items are produced per topic.
 */
export class Deduper {
  private readonly seenKeys = new Set<string>()
  private readonly vectors: number[][] = []

  constructor(private readonly threshold = 0.9) {}

  /** Seed with existing target items so new output doesn't repeat them. */
  seedKeys(keys: string[]): void {
    for (const k of keys) {
      const nk = normalizeKey(k)
      if (nk) this.seenKeys.add(nk)
    }
  }

  seedVectors(vectors: number[][]): void {
    this.vectors.push(...vectors)
  }

  /**
   * Returns the subset of `items` that are new. `vectors[i]` (optional) is the
   * embedding of `items[i].key`; when provided, semantic near-duplicates are
   * rejected in addition to exact normalized-key duplicates.
   */
  filter<T>(items: DedupItem<T>[], vectors?: number[][]): T[] {
    const out: T[] = []
    items.forEach((it, i) => {
      const nk = normalizeKey(it.key)
      if (!nk || this.seenKeys.has(nk)) return
      const vec = vectors?.[i]
      if (vec && this.vectors.some((u) => cosine(u, vec) >= this.threshold)) return
      this.seenKeys.add(nk)
      if (vec) this.vectors.push(vec)
      out.push(it.item)
    })
    return out
  }
}
