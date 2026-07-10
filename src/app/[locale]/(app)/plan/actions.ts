"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq, inArray } from "drizzle-orm"
import { generateObject } from "ai"
import { z } from "zod"
import { db } from "@/db"
import {
  assignment,
  semesterPlan,
  semesterPlanItem,
  studyEvent,
  type PlanAvailability,
} from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getLanguageModel, listAvailableModels } from "@/lib/ai/registry"
import { assertWithinLimit, logUsage } from "@/lib/ai/usage"
import { logAudit } from "@/lib/audit"
import { expandAbsences, validateCron } from "@/lib/plan/absences"
import { ownSemester } from "@/lib/studies/access"

const availabilitySchema = z.object({
  weekly: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .max(21),
  blackouts: z
    .array(
      z.object({
        from: z.string().date(),
        to: z.string().date(),
        label: z.string().max(100).optional(),
      })
    )
    .max(30),
  recurring: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
        interval: z.union([z.literal(1), z.literal(2)]),
        anchor: z.string().date().optional(),
        label: z.string().max(100).optional(),
        cron: z
          .string()
          .max(100)
          .optional()
          .refine((v) => v == null || v === "" || validateCron(v) == null, {
            message: "Invalid cron expression",
          }),
        durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
      })
    )
    .max(20)
    .optional(),
})

export async function saveAvailability(semesterId: string, input: unknown) {
  const session = await requireSession()
  await ownSemester(semesterId, session.user.id)
  const availability = availabilitySchema.parse(input) as PlanAvailability
  await db
    .insert(semesterPlan)
    .values({ userId: session.user.id, semesterId, availability })
    .onConflictDoUpdate({ target: semesterPlan.semesterId, set: { availability } })
  revalidatePath("/", "layout")
  return { ok: true as const }
}

const generatedItemsSchema = z.object({
  items: z
    .array(
      z.object({
        moduleName: z.string().describe("Exact module name from the input, or empty"),
        kind: z.enum(["study", "review", "assignment"]),
        title: z.string().max(200),
        date: z.string().describe("ISO date YYYY-MM-DD"),
        startTime: z.string().describe("HH:mm within an allowed window"),
        durationMinutes: z.number().int().min(30).max(300),
      })
    )
    .max(120),
})

export async function generateSemesterPlan(semesterId: string) {
  const session = await requireSession()
  await assertWithinLimit(session.user.id)
  const sem = await ownSemester(semesterId, session.user.id)

  const plan = await db.query.semesterPlan.findFirst({
    where: eq(semesterPlan.semesterId, semesterId),
  })
  if (!plan) throw new Error("No availability configured")

  const modules = await db.query.studyModule.findMany({
    where: (m, { eq: e }) => e(m.semesterId, semesterId),
    columns: { id: true, name: true, examType: true },
  })
  if (modules.length === 0) throw new Error("No modules in semester")
  const moduleIds = modules.map((m) => m.id)

  const [exams, assignments] = await Promise.all([
    db.query.studyEvent.findMany({
      where: and(
        eq(studyEvent.userId, session.user.id),
        eq(studyEvent.type, "exam"),
        inArray(studyEvent.moduleId, moduleIds)
      ),
      orderBy: [asc(studyEvent.startsAt)],
      columns: { title: true, startsAt: true, moduleId: true },
    }),
    db.query.assignment.findMany({
      where: and(
        eq(assignment.userId, session.user.id),
        inArray(assignment.moduleId, moduleIds)
      ),
      columns: { title: true, dueDate: true, moduleId: true, status: true },
    }),
  ])

  const { defaultModel } = await listAvailableModels()
  if (!defaultModel) throw new Error("No AI model configured")
  const model = await getLanguageModel(defaultModel, session.user.id)

  const moduleByName = new Map(modules.map((m) => [m.name, m.id]))
  const nameById = new Map(modules.map((m) => [m.id, m.name]))
  const today = new Date().toISOString().slice(0, 10)

  // Expand recurring/cron unavailability into concrete windows for the
  // planning horizon — more reliable than asking the model to interpret rules.
  const horizonEnd = new Date()
  horizonEnd.setMonth(horizonEnd.getMonth() + 6)
  const blockedWindows = expandAbsences(plan.availability, new Date(), horizonEnd)

  const promptData = {
    today,
    semester: { name: sem.name, start: sem.startDate, end: sem.endDate },
    blockedWindows,
    modules: modules.map((m) => ({ name: m.name, examType: m.examType })),
    exams: exams.map((e) => ({
      module: e.moduleId ? nameById.get(e.moduleId) : null,
      title: e.title,
      date: e.startsAt.toISOString().slice(0, 10),
    })),
    assignments: assignments
      .filter((a) => a.status !== "graded" && a.dueDate)
      .map((a) => ({
        module: nameById.get(a.moduleId),
        title: a.title,
        dueDate: a.dueDate,
      })),
    availability: plan.availability,
  }

  const { object, usage } = await generateObject({
    model,
    schema: generatedItemsSchema,
    prompt: `Create a semester study plan as concrete calendar sessions.

Rules:
- Only schedule sessions on weekdays/times inside "availability.weekly" windows, never before today (${today}).
- "blockedWindows" lists concrete unavailability: entries with from/to block that time range on that date; entries with from=null block the whole day. Never schedule a session that overlaps a blocked window.
- Distribute study sessions across ALL modules, weighted towards modules with earlier exams.
- Schedule work on each assignment BEFORE its dueDate (kind "assignment", title referencing the assignment).
- In the 2-3 weeks before each exam add "review" sessions for that module (repetition of earlier topics).
- Sessions are 45-180 minutes. At most 2 sessions per day. Titles are short and in the language of the module names.
- Plan until the last exam or assignment deadline; if none exist, plan the next 6 weeks.

Data (JSON): ${JSON.stringify(promptData).slice(0, 15000)}`,
  })

  await logUsage(session.user.id, defaultModel, "semester-plan", {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  })

  // Replace only items that aren't done yet
  await db
    .delete(semesterPlanItem)
    .where(and(eq(semesterPlanItem.planId, plan.id), eq(semesterPlanItem.done, false)))

  const items = object.items
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))
    .map((i, idx) => ({
      planId: plan.id,
      moduleId: moduleByName.get(i.moduleName) ?? null,
      kind: i.kind,
      title: i.title,
      date: i.date,
      startTime: /^\d{2}:\d{2}$/.test(i.startTime) ? i.startTime : null,
      durationMinutes: Math.min(Math.max(i.durationMinutes, 30), 300),
      sortOrder: idx,
    }))
  if (items.length > 0) await db.insert(semesterPlanItem).values(items)

  await db
    .update(semesterPlan)
    .set({ generatedAt: new Date() })
    .where(eq(semesterPlan.id, plan.id))

  await logAudit({
    userId: session.user.id,
    operation: "create",
    entityType: "plan",
    entityId: plan.id,
    entityLabel: `${sem.name} (${items.length})`,
  })

  revalidatePath("/", "layout")
  return { ok: true as const, count: items.length }
}

export async function togglePlanItem(itemId: string, done: boolean) {
  const session = await requireSession()
  const item = await db.query.semesterPlanItem.findFirst({
    where: eq(semesterPlanItem.id, itemId),
    with: { plan: true },
  })
  if (!item || item.plan.userId !== session.user.id) throw new Error("Not found")
  await db.update(semesterPlanItem).set({ done }).where(eq(semesterPlanItem.id, itemId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function deletePlanItem(itemId: string) {
  const session = await requireSession()
  const item = await db.query.semesterPlanItem.findFirst({
    where: eq(semesterPlanItem.id, itemId),
    with: { plan: true },
  })
  if (!item || item.plan.userId !== session.user.id) throw new Error("Not found")
  await db.delete(semesterPlanItem).where(eq(semesterPlanItem.id, itemId))
  revalidatePath("/", "layout")
  return { ok: true as const }
}
