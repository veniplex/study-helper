import "server-only"
import { createHash } from "node:crypto"
import { generateObject } from "ai"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { material, moduleOutline, outlineTopic } from "@/db/schema"
import { getLanguageModel, resolveModelForUser } from "@/lib/ai/registry"
import { runAi } from "@/lib/ai/run"

export type OutlineTopic = {
  id: string
  title: string
  summary: string | null
  sourceMaterialIds: string[]
  weight: number
}

/** Materials whose text is extracted — the basis of the outline + fingerprint. */
type MaterialMap = { id: string; name: string; map: string; contentHash: string | null }

const MAX_MATERIALS = 300
const MAP_CHARS = 2000

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 200)
}

const topicSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().describe("Concise topic title"),
        summary: z.string().describe("1-3 sentences on what this topic covers"),
        sourceMaterials: z
          .array(z.string())
          .describe("Which material tags (e.g. M1, M3) cover this topic"),
        weight: z.number().int().min(1).max(10).describe("Importance / share of the corpus, 1-10"),
      })
    )
    .max(120),
})

async function loadMaterials(userId: string, moduleId: string): Promise<MaterialMap[]> {
  const rows = await db.query.material.findMany({
    where: and(eq(material.userId, userId), eq(material.moduleId, moduleId)),
    columns: { id: true, name: true, summary: true, textContent: true, contentHash: true, kind: true },
  })
  return rows
    .filter((r) => r.kind === "file" && (r.summary || r.textContent))
    .slice(0, MAX_MATERIALS)
    .map((r) => ({
      id: r.id,
      name: r.name,
      contentHash: r.contentHash,
      map: (r.summary ?? r.textContent ?? "").slice(0, MAP_CHARS),
    }))
}

/** Stable hash over the module's extracted materials (id + content hash). */
function fingerprintOf(materials: MaterialMap[]): string {
  const parts = materials
    .map((m) => `${m.id}:${m.contentHash ?? ""}`)
    .sort()
    .join("|")
  return createHash("sha256").update(parts).digest("hex")
}

export async function getModuleTopics(moduleId: string): Promise<OutlineTopic[]> {
  const state = await db.query.moduleOutline.findFirst({
    where: eq(moduleOutline.moduleId, moduleId),
  })
  if (!state) return []
  const rows = await db.query.outlineTopic.findMany({
    where: and(eq(outlineTopic.moduleId, moduleId), eq(outlineTopic.version, state.version)),
    orderBy: [asc(outlineTopic.sortOrder)],
  })
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    sourceMaterialIds: r.sourceMaterialIds,
    weight: r.weight,
  }))
}

/**
 * Builds (or reuses) the module's topic outline. The outline is only rebuilt
 * when the material fingerprint changed; on rebuild, topic ids are carried over
 * for topics whose (normalized) title is unchanged, so per-target coverage is
 * preserved and only genuinely new topics need generating.
 *
 * Returns the current topics, or an empty list when no model/materials are
 * available (callers degrade to the legacy top-k path).
 */
export async function buildModuleOutline(
  userId: string,
  moduleId: string,
  opts: { force?: boolean } = {}
): Promise<OutlineTopic[]> {
  const materials = await loadMaterials(userId, moduleId)
  const fingerprint = fingerprintOf(materials)

  const state = await db.query.moduleOutline.findFirst({
    where: eq(moduleOutline.moduleId, moduleId),
  })

  if (!opts.force && state && state.status === "ready" && state.fingerprint === fingerprint) {
    return getModuleTopics(moduleId)
  }
  if (materials.length === 0) return []

  const modelRef = await resolveModelForUser(userId)
  if (!modelRef) return state ? getModuleTopics(moduleId) : []
  const model = await getLanguageModel(modelRef, userId)

  const nextVersion = (state?.version ?? 0) + 1
  await db
    .insert(moduleOutline)
    .values({ moduleId, userId, version: state?.version ?? 0, status: "building" })
    .onConflictDoUpdate({
      target: moduleOutline.moduleId,
      set: { status: "building" },
    })

  // Present materials with short tags (M1, M2, …) the model can echo reliably.
  const tagToId = new Map<string, string>()
  const catalog = materials
    .map((m, i) => {
      const tag = `M${i + 1}`
      tagToId.set(tag, m.id)
      return `[${tag}] ${m.name}\n${m.map}`
    })
    .join("\n\n---\n\n")

  let topics: z.infer<typeof topicSchema>["topics"]
  try {
    const { object } = await runAi(
      {
        userId,
        model: modelRef,
        feature: "outline",
        operation: "ai_summarize",
        moduleId,
        entityType: "module",
        entityId: moduleId,
        entityLabel: "Module outline",
      },
      () =>
        generateObject({
          model,
          schema: topicSchema,
          prompt: `You are building a complete study outline for one university course module from summaries of ALL its materials. Produce a de-duplicated, comprehensive list of topics such that generating flashcards/quiz questions per topic would cover the ENTIRE material — miss nothing, but do not duplicate topics. Use more topics for larger/broader corpora (roughly one topic per distinct concept area). For each topic give: a concise title, a 1-3 sentence summary of what it covers, the material tags that cover it (from the list), and a weight 1-10 for how much of the corpus it represents.\n\nMaterials:\n${catalog}`,
        })
    )
    topics = object.topics
  } catch (error) {
    await db
      .update(moduleOutline)
      .set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "failed" })
      .where(eq(moduleOutline.moduleId, moduleId))
    throw error
  }

  // Carry over ids for unchanged topics (match by normalized title) to preserve
  // per-target coverage across rebuilds.
  const prev = state
    ? await db.query.outlineTopic.findMany({
        where: and(eq(outlineTopic.moduleId, moduleId), eq(outlineTopic.version, state.version)),
      })
    : []
  const prevByKey = new Map(prev.map((p) => [p.titleKey, p]))
  const usedPrevIds = new Set<string>()
  const result: OutlineTopic[] = []

  await db.transaction(async (tx) => {
    const toInsert: (typeof outlineTopic.$inferInsert)[] = []
    for (const [i, t] of topics.entries()) {
      const titleKey = normalizeTitle(t.title)
      const summary = t.summary.slice(0, 2000)
      const title = t.title.slice(0, 300)
      const sourceMaterialIds = t.sourceMaterials
        .map((tag) => tagToId.get(tag.trim()))
        .filter((id): id is string => Boolean(id))
      const carried = prevByKey.get(titleKey)
      if (carried && !usedPrevIds.has(carried.id)) {
        // Update in place — keeps the id so per-target coverage is preserved.
        usedPrevIds.add(carried.id)
        await tx
          .update(outlineTopic)
          .set({ version: nextVersion, title, titleKey, summary, sourceMaterialIds, weight: t.weight, sortOrder: i })
          .where(eq(outlineTopic.id, carried.id))
        result.push({ id: carried.id, title, summary, sourceMaterialIds, weight: t.weight })
      } else {
        const id = crypto.randomUUID()
        toInsert.push({ id, moduleId, userId, version: nextVersion, title, titleKey, summary, sourceMaterialIds, weight: t.weight, sortOrder: i })
        result.push({ id, title, summary, sourceMaterialIds, weight: t.weight })
      }
    }
    if (toInsert.length > 0) await tx.insert(outlineTopic).values(toInsert)
    // Whatever remains at the old version was not carried over — remove it
    // (cascades its coverage rows).
    if (state) {
      await tx
        .delete(outlineTopic)
        .where(and(eq(outlineTopic.moduleId, moduleId), eq(outlineTopic.version, state.version)))
    }
    await tx
      .update(moduleOutline)
      .set({ version: nextVersion, fingerprint, status: "ready", topicCount: result.length, error: null })
      .where(eq(moduleOutline.moduleId, moduleId))
  })

  return result
}
