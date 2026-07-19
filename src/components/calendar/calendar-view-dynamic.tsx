"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import type { CalendarView as CalendarViewImpl } from "@/components/calendar/calendar-view"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function CalendarSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[520px] w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

// FullCalendar (@fullcalendar/react + daygrid/timegrid/interaction) is a heavy
// grid library. Load it client-only and off the critical path so the page shell
// paints immediately behind a skeleton (F2). SSR is disabled because the grid
// relies on layout measurement in the browser.
const CalendarViewLazy = dynamic(
  () => import("@/components/calendar/calendar-view").then((m) => m.CalendarView),
  { ssr: false, loading: () => <CalendarSkeleton /> }
)

export function CalendarView(props: React.ComponentProps<typeof CalendarViewImpl>) {
  return <CalendarViewLazy {...props} />
}
