import {
  BrainCircuit,
  CalendarClock,
  ClipboardCheck,
  FileText,
  LayoutList,
  Layers,
  MessageSquare,
  PenLine,
  type LucideIcon,
} from "lucide-react"
import type { GoalType, ModuleToolKey } from "@/db/schema/studies"

/**
 * Single source of truth for a module's sub-pages. Consumed by the sidebar
 * tree (with icons) and the ModuleTabs bar — keep route segments and
 * `moduleTabs.*` i18n keys in sync here only.
 */
export const MODULE_TABS: readonly {
  key: ModuleToolKey
  segment: string
  icon: LucideIcon
}[] = [
  { key: "overview", segment: "", icon: LayoutList },
  { key: "materials", segment: "/materials", icon: FileText },
  { key: "assignments", segment: "/assignments", icon: ClipboardCheck },
  { key: "decks", segment: "/decks", icon: Layers },
  { key: "quizzes", segment: "/quizzes", icon: BrainCircuit },
  { key: "paper", segment: "/paper", icon: PenLine },
  { key: "plan", segment: "/plan", icon: CalendarClock },
  { key: "chat", segment: "/chat", icon: MessageSquare },
]

/**
 * The tools a module can show or hide per goal. overview/materials/plan are
 * always on and chat is AI-gated, so they never appear here — only these four
 * are driven by the goal matrix and the "more tools" popover.
 */
export const optionalToolKeys = [
  "assignments",
  "decks",
  "quizzes",
  "paper",
] as const satisfies readonly ModuleToolKey[]

const OPTIONAL_TOOL_SET: ReadonlySet<ModuleToolKey> = new Set(optionalToolKeys)

/**
 * Maps a module's goal types to the optional tools they enable by default.
 * Always-on tools (overview/materials/plan/chat) are handled separately and
 * are never returned here. Result is de-duped.
 */
export function defaultToolsForGoals(goalTypes: GoalType[]): ModuleToolKey[] {
  const tools = new Set<ModuleToolKey>()
  for (const type of goalTypes) {
    switch (type) {
      case "exam":
      case "oral_exam":
        tools.add("decks")
        tools.add("quizzes")
        break
      case "assignments":
        tools.add("assignments")
        break
      case "term_paper":
      case "thesis":
      case "project":
        tools.add("paper")
        break
      case "presentation":
        tools.add("decks")
        break
    }
  }
  return [...tools]
}

/**
 * Effective optional tools = the goal-derived defaults merged with explicit
 * per-module overrides (`true` force-adds, `false` force-removes). Only the
 * optional tools are affected; always-on tools are never in the override set.
 */
export function enabledTools(
  goalTypes: GoalType[],
  toolOverrides: Partial<Record<ModuleToolKey, boolean>> = {}
): ModuleToolKey[] {
  const tools = new Set<ModuleToolKey>(defaultToolsForGoals(goalTypes))
  for (const key of optionalToolKeys) {
    const override = toolOverrides[key]
    if (override === true) tools.add(key)
    else if (override === false) tools.delete(key)
  }
  return [...tools]
}

/**
 * The tabs to render: overview/materials/plan are always shown, chat is shown
 * iff AI is available, and the optional tools are shown iff in `enabledTools`.
 */
export function visibleModuleTabs(opts: { aiAvailable: boolean; enabledTools: ModuleToolKey[] }) {
  const enabled = new Set(opts.enabledTools)
  return MODULE_TABS.filter((tab) => {
    if (tab.key === "chat") return opts.aiAvailable
    if (OPTIONAL_TOOL_SET.has(tab.key)) return enabled.has(tab.key)
    return true // overview, materials, plan
  })
}
