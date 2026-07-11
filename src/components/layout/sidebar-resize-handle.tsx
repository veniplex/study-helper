"use client"

import * as React from "react"

const MIN = 200
const MAX = 400

/**
 * Drag handle on the sidebar's right edge. Updates the `--sidebar-width` CSS
 * variable on #app-shell live and persists the final width to a cookie so the
 * server layout can render it without a flash on the next load.
 */
export function SidebarResizeHandle() {
  const dragging = React.useRef(false)

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return
      const width = Math.min(MAX, Math.max(MIN, e.clientX))
      document.getElementById("app-shell")?.style.setProperty("--sidebar-width", `${width}px`)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ""
      const current = getComputedStyle(document.getElementById("app-shell")!).getPropertyValue(
        "--sidebar-width"
      )
      const width = parseInt(current, 10) || 240
      document.cookie = `sidebar-width=${width}; path=/; max-age=31536000; samesite=lax`
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={() => {
        dragging.current = true
        document.body.style.userSelect = "none"
      }}
      className="hover:bg-primary/40 absolute inset-y-0 -right-0.5 z-40 w-1 cursor-col-resize transition-colors"
    />
  )
}
