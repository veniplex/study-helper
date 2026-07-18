import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
    </div>
  )
}
