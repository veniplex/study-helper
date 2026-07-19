import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { semesterPlan } from "@/db/schema"

/**
 * Marks a semester's plan as stale (out of date). A no-op if the semester has
 * no plan row yet. Callers that mutate plan-relevant data (tasks, prefs,
 * availability, exam dates) call this so the UI can offer a "replan" banner
 * without forcing an immediate, possibly-expensive recompute.
 */
export async function markPlanStale(semesterId: string): Promise<void> {
  await db
    .update(semesterPlan)
    .set({ staleAt: new Date() })
    .where(eq(semesterPlan.semesterId, semesterId))
}
