import {
  Brain,
  Calendar,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  /** Translation key under the `nav` namespace */
  key: "dashboard" | "studies" | "materials" | "learn" | "calendar" | "ai" | "settings"
  href: string
  icon: LucideIcon
  /** Shown in the mobile bottom navigation */
  mobile?: boolean
}

export const navItems: NavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, mobile: true },
  { key: "studies", href: "/studies", icon: GraduationCap, mobile: true },
  { key: "materials", href: "/materials", icon: FolderOpen },
  { key: "learn", href: "/learn", icon: Brain, mobile: true },
  { key: "calendar", href: "/calendar", icon: Calendar, mobile: true },
  { key: "ai", href: "/ai", icon: Sparkles, mobile: true },
  { key: "settings", href: "/settings", icon: Settings },
]
