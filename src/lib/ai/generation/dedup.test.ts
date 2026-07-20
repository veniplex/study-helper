import { describe, expect, it, vi } from "vitest"

// dedup.ts is server-only and pulls the AI registry/runner in for `embedTexts`.
// Neutralise both so the pure helpers (`normalizeKey`, `Deduper`) can be unit
// tested without any provider configuration.
vi.mock("server-only", () => ({}))
vi.mock("ai", () => ({ embedMany: vi.fn() }))
vi.mock("@/lib/ai/registry", () => ({ getEmbeddingModel: vi.fn() }))
vi.mock("@/lib/ai/run", () => ({ runAi: vi.fn() }))

import { Deduper, normalizeKey, type DedupItem } from "./dedup"

/** Wraps plain strings as dedup items whose payload is the string itself. */
function items(...keys: string[]): DedupItem<string>[] {
  return keys.map((key) => ({ key, item: key }))
}

describe("normalizeKey", () => {
  it("lowercases", () => {
    expect(normalizeKey("Photosynthesis")).toBe("photosynthesis")
  })

  it("keeps umlauts and other letters as-is", () => {
    expect(normalizeKey("Größe der Zelle")).toBe("größe der zelle")
    expect(normalizeKey("ÜBUNG")).toBe("übung")
  })

  it("replaces punctuation with a single space", () => {
    expect(normalizeKey("What is ATP? (short)")).toBe("what is atp short")
    expect(normalizeKey("a---b")).toBe("a b")
  })

  it("collapses whitespace and trims", () => {
    expect(normalizeKey("  a \t\n  b  ")).toBe("a b")
  })

  it("keeps digits", () => {
    expect(normalizeKey("Kapitel 12: Genetik")).toBe("kapitel 12 genetik")
  })

  it("returns an empty string for punctuation-only input", () => {
    expect(normalizeKey("!!! ??? ---")).toBe("")
    expect(normalizeKey("   ")).toBe("")
  })

  it("maps differently written but equivalent keys onto the same value", () => {
    expect(normalizeKey("Was ist ATP?")).toBe(normalizeKey("  was ist   ATP  "))
  })
})

// `cosine` is module-private, so its behaviour is exercised through the
// semantic branch of `Deduper.filter` (threshold comparison is `>=`).
describe("Deduper semantic similarity (cosine)", () => {
  it("treats identical vectors as duplicates", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0, 0]])
    expect(d.filter(items("a"), [[1, 0, 0]])).toEqual([])
  })

  it("treats scaled (parallel) vectors as duplicates", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 2, 3]])
    expect(d.filter(items("a"), [[2, 4, 6]])).toEqual([])
  })

  it("keeps orthogonal vectors", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0]])
    expect(d.filter(items("a"), [[0, 1]])).toEqual(["a"])
  })

  it("keeps items whose vector is all zeroes (similarity 0)", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0]])
    expect(d.filter(items("a"), [[0, 0]])).toEqual(["a"])
  })

  it("keeps items when the seeded vector is all zeroes", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[0, 0]])
    expect(d.filter(items("a"), [[1, 0]])).toEqual(["a"])
  })

  it("compares only the overlapping prefix when lengths differ", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0, 99]])
    // Only the first two components are compared → similarity 1 → duplicate.
    expect(d.filter(items("a"), [[1, 0]])).toEqual([])
  })

  it("rejects at exactly the threshold and keeps just below it", () => {
    // cos([1,0], [3,4]) === 3/5 === 0.6 exactly.
    const atThreshold = new Deduper(0.6)
    atThreshold.seedVectors([[1, 0]])
    expect(atThreshold.filter(items("a"), [[3, 4]])).toEqual([])

    // cos([1,0], [4,3]) === 0.8, which is below a 0.9 threshold.
    const below = new Deduper(0.9)
    below.seedVectors([[1, 0]])
    expect(below.filter(items("b"), [[4, 3]])).toEqual(["b"])
  })
})

describe("Deduper.filter", () => {
  it("drops exact duplicates within one batch, keeping the first occurrence", () => {
    const d = new Deduper()
    expect(d.filter(items("ATP", "atp!", "Glucose"))).toEqual(["ATP", "Glucose"])
  })

  it("drops duplicates across successive calls (accumulating state)", () => {
    const d = new Deduper()
    expect(d.filter(items("ATP"))).toEqual(["ATP"])
    expect(d.filter(items("  atp  ", "NADH"))).toEqual(["NADH"])
  })

  it("drops items whose key normalizes to nothing", () => {
    const d = new Deduper()
    expect(d.filter(items("???", "ATP"))).toEqual(["ATP"])
  })

  it("returns an empty array for an empty input", () => {
    expect(new Deduper().filter([])).toEqual([])
  })

  it("works without vectors at all", () => {
    const d = new Deduper()
    expect(d.filter(items("a", "b"))).toEqual(["a", "b"])
  })
})

describe("Deduper seeding", () => {
  it("seedKeys rejects previously known items (normalized)", () => {
    const d = new Deduper()
    d.seedKeys(["Was ist ATP?"])
    expect(d.filter(items("was ist atp", "Was ist NADH?"))).toEqual(["Was ist NADH?"])
  })

  it("seedKeys ignores keys that normalize to nothing", () => {
    const d = new Deduper()
    d.seedKeys(["!!!"])
    // An empty normalized key must not become a catch-all match.
    expect(d.filter(items("ATP"))).toEqual(["ATP"])
  })

  it("seedVectors rejects semantic near-duplicates of pre-existing items", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0]])
    expect(d.filter(items("near", "far"), [[0.99, 0.1], [0, 1]])).toEqual(["far"])
  })
})

describe("Deduper index alignment between items and vectors", () => {
  it("pairs vectors[i] with items[i] even after earlier items were rejected", () => {
    const d = new Deduper(0.9)
    d.seedKeys(["b"]) // items[1] is rejected on key, before its vector is looked at
    const result = d.filter(items("a", "b", "c"), [
      [1, 0], // a
      [0, 1], // b (rejected by key — its vector must not be attributed to c)
      [0, 1], // c — orthogonal to a, so it must survive
    ])
    expect(result).toEqual(["a", "c"])
  })

  it("does not shift vectors when an item is rejected as a semantic duplicate", () => {
    const d = new Deduper(0.9)
    const result = d.filter(items("a", "b", "c"), [
      [1, 0, 0], // a — accepted, vector remembered
      [1, 0, 0], // b — duplicate of a, rejected
      [0, 0, 1], // c — distinct, accepted
    ])
    expect(result).toEqual(["a", "c"])
  })

  it("rejects a later item that duplicates an earlier accepted item's vector", () => {
    const d = new Deduper(0.9)
    expect(
      d.filter(items("a", "b", "c"), [
        [1, 0], // a
        [0, 1], // b
        [1, 0], // c — same as a
      ])
    ).toEqual(["a", "b"])
  })

  it("preserves input order in the returned items", () => {
    const d = new Deduper()
    expect(d.filter(items("z", "y", "x"))).toEqual(["z", "y", "x"])
  })

  it("tolerates a vectors array shorter than items", () => {
    const d = new Deduper(0.9)
    d.seedVectors([[1, 0]])
    // items[1] has no vector → only the key check applies → kept.
    expect(d.filter(items("a", "b"), [[1, 0]])).toEqual(["b"])
  })
})
