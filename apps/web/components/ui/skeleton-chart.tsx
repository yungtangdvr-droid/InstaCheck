import * as React from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type SkeletonChartProps = {
  height?: number
  className?: string
}

function SkeletonChart({ height = 240, className }: SkeletonChartProps) {
  return (
    <div
      data-slot="skeleton-chart"
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border bg-card p-4",
        className
      )}
      style={{ height }}
      aria-busy
      aria-live="polite"
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="relative flex-1">
          <div
            className="absolute inset-0 flex flex-col justify-between"
            aria-hidden
          >
            <div className="border-t border-border/60" />
            <div className="border-t border-border/60" />
            <div className="border-t border-border/60" />
            <div className="border-t border-border/60" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-2/3 items-end gap-2">
            <Skeleton className="h-1/2 flex-1" />
            <Skeleton className="h-3/4 flex-1" />
            <Skeleton className="h-2/5 flex-1" />
            <Skeleton className="h-full flex-1" />
            <Skeleton className="h-3/5 flex-1" />
            <Skeleton className="h-1/3 flex-1" />
            <Skeleton className="h-4/5 flex-1" />
          </div>
        </div>
      </div>
    </div>
  )
}

export { SkeletonChart, type SkeletonChartProps }
