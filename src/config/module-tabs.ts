import {
  BrainCircuit,
  ClipboardCheck,
  FileText,
  LayoutList,
  Layers,
  MessageSquare,
  type LucideIcon,
} from "lucide-react"

/**
 * Single source of truth for a module's sub-pages. Consumed by the sidebar
 * tree (with icons) and the ModuleTabs bar — keep route segments and
 * `moduleTabs.*` i18n keys in sync here only.
 */
export const MODULE_TABS: readonly {
  key: "overview" | "materials" | "assignments" | "decks" | "quizzes" | "chat"
  segment: string
  icon: LucideIcon
}[] = [
  { key: "overview", segment: "", icon: LayoutList },
  { key: "materials", segment: "/materials", icon: FileText },
  { key: "assignments", segment: "/assignments", icon: ClipboardCheck },
  { key: "decks", segment: "/decks", icon: Layers },
  { key: "quizzes", segment: "/quizzes", icon: BrainCircuit },
  { key: "chat", segment: "/chat", icon: MessageSquare },
]

/** The chat tab requires a configured AI model. */
export function visibleModuleTabs(aiAvailable: boolean) {
  return MODULE_TABS.filter((tab) => aiAvailable || tab.key !== "chat")
}
