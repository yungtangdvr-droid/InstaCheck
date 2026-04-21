type Props = {
  aesthetic: number
  business:  number
}

function toneFor(v: number): string {
  if (v >= 70) return 'bg-emerald-500/15 text-emerald-400'
  if (v >= 40) return 'bg-amber-500/15 text-amber-400'
  return 'bg-neutral-800 text-neutral-400'
}

export function FitScoreBadge({ aesthetic, business }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={`inline-flex h-6 items-center rounded px-1.5 font-semibold tabular-nums ${toneFor(aesthetic)}`}
        title="Aesthetic fit score"
      >
        A·{aesthetic}
      </span>
      <span
        className={`inline-flex h-6 items-center rounded px-1.5 font-semibold tabular-nums ${toneFor(business)}`}
        title="Business fit score"
      >
        B·{business}
      </span>
    </span>
  )
}
