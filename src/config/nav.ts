import {
  Calendar,
  LayoutDashboard,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  /** Translation key under the `nav` namespace */
  key: "dashboard" | "calendar" | "ai"
  href: string
  icon: LucideIcon
  /** Shown in the mobile bottom navigation */
  mobile?: boolean
}

/** Top-level pages. Desktop sidebar shows dashboard + calendar above the
 * semester tree; the AI entry only appears in the mobile bottom nav. */
export const navItems: NavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, mobile: true },
  { key: "calendar", href: "/calendar", icon: Calendar, mobile: true },
  { key: "ai", href: "/ai", icon: Sparkles, mobile: true },
]
