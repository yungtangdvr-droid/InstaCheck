import * as React from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type SkeletonCardProps = {
  lines?: number
  className?: string
}

function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  const safeLines = Math.max(1, lines)
  return (
    <div
      data-slot="skeleton-card"
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-5",
        className
      )}
      aria-busy
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: safeLines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3", i === safeLines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  )
}

export { SkeletonCard, type SkeletonCardProps }
