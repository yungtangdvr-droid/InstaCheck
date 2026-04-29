import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const verdictBadgeStyles = cva(
  "inline-flex items-center gap-1 rounded-md border font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-success/30 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        danger: "border-danger/30 bg-danger-soft text-danger",
        info: "border-accent-chart/30 bg-accent-chart/10 text-accent-chart",
      },
      size: {
        sm: "h-5 px-1.5 text-[11px]",
        md: "h-6 px-2 text-xs",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  }
)

type VerdictBadgeProps = {
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
} & VariantProps<typeof verdictBadgeStyles>

function VerdictBadge({
  tone,
  size,
  icon,
  children,
  className,
}: VerdictBadgeProps) {
  return (
    <span
      data-slot="verdict-badge"
      className={cn(verdictBadgeStyles({ tone, size }), className)}
    >
      {icon ? (
        <span className="inline-flex shrink-0" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

export { VerdictBadge, verdictBadgeStyles, type VerdictBadgeProps }
