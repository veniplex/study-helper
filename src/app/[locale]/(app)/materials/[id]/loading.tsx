import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-[70vh]" />
    </div>
  )
}
