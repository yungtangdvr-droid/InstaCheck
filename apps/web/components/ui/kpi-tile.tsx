import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const deltaToneStyles = cva("text-xs font-medium tabular-nums", {
  variants: {
    tone: {
      neutral: "text-muted-foreground",
      positive: "text-success",
      negative: "text-danger",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
})

type KpiTileDelta = {
  value: React.ReactNode
} & VariantProps<typeof deltaToneStyles>

type KpiTileProps = {
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  delta?: KpiTileDelta
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

function KpiTile({
  label,
  value,
  unit,
  delta,
  hint,
  icon,
  className,
}: KpiTileProps) {
  return (
    <div
      data-slot="kpi-tile"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-glass)] p-5 text-card-foreground backdrop-blur-xl shadow-[var(--shadow-soft)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-muted-foreground">{unit}</span>
        ) : null}
        {delta ? (
          <span className={cn(deltaToneStyles({ tone: delta.tone }), "ml-1")}>
            {delta.value}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export { KpiTile, type KpiTileProps, type KpiTileDelta }
