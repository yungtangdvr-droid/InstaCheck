import * as React from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type SkeletonTableProps = {
  rows?: number
  cols?: number
  className?: string
}

function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)
  return (
    <div
      data-slot="skeleton-table"
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card",
        className
      )}
      aria-busy
      aria-live="polite"
    >
      <div
        className="grid gap-3 border-b border-border px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: safeCols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 w-2/3" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: safeRows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0"
            style={{
              gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: safeCols }).map((_, c) => (
              <Skeleton
                key={`c-${r}-${c}`}
                className={cn("h-3", c === 0 ? "w-3/4" : "w-1/2")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { SkeletonTable, type SkeletonTableProps }
