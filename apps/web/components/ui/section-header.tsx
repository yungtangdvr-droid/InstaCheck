import * as React from "react"

import { cn } from "@/lib/utils"

type SectionHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  as?: "h2" | "h3"
  className?: string
}

function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  as = "h2",
  className,
}: SectionHeaderProps) {
  const Heading = as
  return (
    <div
      data-slot="section-header"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <Heading className="text-lg font-semibold leading-tight tracking-tight text-card-foreground">
          {title}
        </Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export { SectionHeader, type SectionHeaderProps }
