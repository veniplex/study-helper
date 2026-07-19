"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

/**
 * Determinate-ish progress for a blocking single-shot generation (E14). A
 * synchronous server action can't stream real progress, so — instead of a bare
 * spinner for a request that can take a while on large counts — we animate a
 * bar toward ~90% over an estimate proportional to the item count, then hold
 * until the call resolves and the dialog navigates/closes.
 */
export function EstimatedProgress({ count, label }: { count: number; label: string }) {
  const [pct, setPct] = React.useState(5)
  React.useEffect(() => {
    // Rough estimate: a few seconds of overhead plus ~1.2s per generated item,
    // capped at a minute. Ease toward 90% and hold there.
    const estMs = Math.min(3000 + Math.max(count, 1) * 1200, 60_000)
    const start = Date.now()
    const id = setInterval(() => {
      const p = Math.min(90, Math.round(((Date.now() - start) / estMs) * 90))
      setPct(p)
    }, 300)
    return () => clearInterval(id)
  }, [count])

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
