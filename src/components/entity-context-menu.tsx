"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

export type ContextMenuAction = {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  destructive?: boolean
  /** Draw a separator above this item. */
  separatorBefore?: boolean
}

/**
 * Wraps an element so right-clicking it opens a context menu with the given
 * actions. With no actions the child is rendered unchanged, so empty areas keep
 * the native browser menu.
 */
export function EntityContextMenu({
  items,
  label,
  children,
}: {
  items: ContextMenuAction[]
  /** Optional heading shown at the top of the menu. */
  label?: string
  children: React.ReactElement
}) {
  if (items.length === 0) return children

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        {label && (
          // Base UI requires GroupLabel to live inside a Group.
          <ContextMenuGroup>
            <ContextMenuGroupLabel>{label}</ContextMenuGroupLabel>
          </ContextMenuGroup>
        )}
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {item.separatorBefore && <ContextMenuSeparator />}
            <ContextMenuItem
              variant={item.destructive ? "destructive" : "default"}
              onClick={item.onSelect}
            >
              {item.icon && <item.icon />}
              {item.label}
            </ContextMenuItem>
          </React.Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
