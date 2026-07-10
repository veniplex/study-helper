import {
  Calendar,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  /** Translation key under the `nav` namespace */
  key: "dashboard" | "studies" | "calendar" | "ai" | "settings"
  href: string
  icon: LucideIcon
  /** Shown in the mobile bottom navigation */
  mobile?: boolean
}

export const navItems: NavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, mobile: true },
  { key: "studies", href: "/studies", icon: GraduationCap, mobile: true },
  { key: "calendar", href: "/calendar", icon: Calendar, mobile: true },
  { key: "ai", href: "/ai", icon: Sparkles, mobile: true },
  { key: "settings", href: "/settings", icon: Settings },
]
