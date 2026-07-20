import "server-only"

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()
const MAX_ENTRIES = 50_000

/**
 * Fixed-window in-memory rate limiter for app API routes. Deliberately
 * per-process: the deployment story is a single web instance (plus an optional
 * worker); with multiple replicas the limit applies per replica, which still
 * bounds abuse. better-auth ships its own limiter for the /api/auth/* routes.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_ENTRIES) prune(now, windowMs)
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }
  bucket.count++
  return bucket.count <= max
}

function prune(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) buckets.delete(key)
  }
  // Pathological case (all entries live): drop oldest insertions.
  if (buckets.size >= MAX_ENTRIES) {
    let overflow = buckets.size - MAX_ENTRIES + 1
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (--overflow <= 0) break
    }
  }
}

/** Best-effort client IP for keying unauthenticated routes. */
export function clientIp(request: Request): string {
  // A header of "," or " " would previously key every such request under the
  // empty string, lumping unrelated clients into one bucket.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded
  return request.headers.get("x-real-ip") ?? "unknown"
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60" },
  })
}

/** Test-only: reset all counters. */
export function resetRateLimits(): void {
  buckets.clear()
}
