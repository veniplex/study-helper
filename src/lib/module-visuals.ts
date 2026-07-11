import {
  Atom,
  Binary,
  BookMarked,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  ChartBar,
  CircuitBoard,
  Cloud,
  Code,
  Coins,
  Cpu,
  Database,
  Dna,
  Film,
  FlaskConical,
  FunctionSquare,
  Gavel,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Lightbulb,
  Lock,
  Megaphone,
  Microscope,
  Mountain,
  Music,
  Network,
  Newspaper,
  Palette,
  PenTool,
  Rocket,
  Scale,
  Shield,
  Sigma,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { ModuleStatus } from "@/db/schema/studies"

/** Curated icons a user can pick for a module. Keys are stored in module.icon. */
export const MODULE_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  bookmarked: BookMarked,
  calculator: Calculator,
  sigma: Sigma,
  function: FunctionSquare,
  flask: FlaskConical,
  atom: Atom,
  dna: Dna,
  microscope: Microscope,
  heart: HeartPulse,
  leaf: Leaf,
  mountain: Mountain,
  globe: Globe,
  code: Code,
  binary: Binary,
  cpu: Cpu,
  circuit: CircuitBoard,
  database: Database,
  network: Network,
  cloud: Cloud,
  bot: Bot,
  lock: Lock,
  shield: Shield,
  brain: Brain,
  lightbulb: Lightbulb,
  chart: ChartBar,
  trending: TrendingUp,
  coins: Coins,
  briefcase: Briefcase,
  building: Building2,
  landmark: Landmark,
  scale: Scale,
  gavel: Gavel,
  users: Users,
  languages: Languages,
  pen: PenTool,
  palette: Palette,
  music: Music,
  camera: Camera,
  film: Film,
  newspaper: Newspaper,
  megaphone: Megaphone,
  rocket: Rocket,
  wrench: Wrench,
  graduation: GraduationCap,
}

export const MODULE_ICON_KEYS = Object.keys(MODULE_ICONS)

/** Returns the icon component for a stored key, defaulting to BookOpen. */
export function getModuleIcon(key?: string | null): LucideIcon {
  return (key && MODULE_ICONS[key]) || BookOpen
}

export type ModuleColorClasses = {
  /** Small solid dot / accent. */
  dot: string
  /** Tinted chip background + text. */
  chip: string
  /** Icon foreground color. */
  text: string
  /** Soft icon container background. */
  soft: string
}

/** Palette a user can pick from. Keys are stored in module.color. */
export const MODULE_COLORS: Record<string, ModuleColorClasses> = {
  slate: { dot: "bg-slate-500", chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300", text: "text-slate-600 dark:text-slate-400", soft: "bg-slate-500/10" },
  gray: { dot: "bg-gray-500", chip: "bg-gray-500/15 text-gray-700 dark:text-gray-300", text: "text-gray-600 dark:text-gray-400", soft: "bg-gray-500/10" },
  zinc: { dot: "bg-zinc-500", chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300", text: "text-zinc-600 dark:text-zinc-400", soft: "bg-zinc-500/10" },
  stone: { dot: "bg-stone-500", chip: "bg-stone-500/15 text-stone-700 dark:text-stone-300", text: "text-stone-600 dark:text-stone-400", soft: "bg-stone-500/10" },
  red: { dot: "bg-red-500", chip: "bg-red-500/15 text-red-700 dark:text-red-300", text: "text-red-600 dark:text-red-400", soft: "bg-red-500/10" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", soft: "bg-orange-500/10" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-500/10" },
  yellow: { dot: "bg-yellow-500", chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300", text: "text-yellow-600 dark:text-yellow-400", soft: "bg-yellow-500/10" },
  lime: { dot: "bg-lime-500", chip: "bg-lime-500/15 text-lime-700 dark:text-lime-300", text: "text-lime-600 dark:text-lime-400", soft: "bg-lime-500/10" },
  green: { dot: "bg-green-500", chip: "bg-green-500/15 text-green-700 dark:text-green-300", text: "text-green-600 dark:text-green-400", soft: "bg-green-500/10" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-500/10" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300", text: "text-teal-600 dark:text-teal-400", soft: "bg-teal-500/10" },
  cyan: { dot: "bg-cyan-500", chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300", text: "text-cyan-600 dark:text-cyan-400", soft: "bg-cyan-500/10" },
  sky: { dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400", soft: "bg-sky-500/10" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300", text: "text-blue-600 dark:text-blue-400", soft: "bg-blue-500/10" },
  indigo: { dot: "bg-indigo-500", chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300", text: "text-indigo-600 dark:text-indigo-400", soft: "bg-indigo-500/10" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300", text: "text-violet-600 dark:text-violet-400", soft: "bg-violet-500/10" },
  purple: { dot: "bg-purple-500", chip: "bg-purple-500/15 text-purple-700 dark:text-purple-300", text: "text-purple-600 dark:text-purple-400", soft: "bg-purple-500/10" },
  fuchsia: { dot: "bg-fuchsia-500", chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300", text: "text-fuchsia-600 dark:text-fuchsia-400", soft: "bg-fuchsia-500/10" },
  pink: { dot: "bg-pink-500", chip: "bg-pink-500/15 text-pink-700 dark:text-pink-300", text: "text-pink-600 dark:text-pink-400", soft: "bg-pink-500/10" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300", text: "text-rose-600 dark:text-rose-400", soft: "bg-rose-500/10" },
}

export const MODULE_COLOR_KEYS = Object.keys(MODULE_COLORS)

const FALLBACK_COLOR: ModuleColorClasses = {
  dot: "bg-muted-foreground/40",
  chip: "bg-muted text-muted-foreground",
  text: "text-muted-foreground",
  soft: "bg-muted",
}

/** Returns tailwind class sets for a stored color key, or a muted fallback. */
export function getModuleColorClasses(key?: string | null): ModuleColorClasses {
  return (key && MODULE_COLORS[key]) || FALLBACK_COLOR
}

/** Chip classes per module status (colored badges everywhere). */
export const STATUS_STYLES: Record<ModuleStatus, string> = {
  planned: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  active: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
}

/** Solid dot color per module status (sidebar indicator). */
export const STATUS_DOT: Record<ModuleStatus, string> = {
  planned: "bg-slate-400",
  active: "bg-sky-500",
  passed: "bg-emerald-500",
  failed: "bg-red-500",
}
