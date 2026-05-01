import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'

type Tone = NonNullable<VerdictBadgeProps['tone']>

type SensitivityChipsProps = {
  items:    readonly string[]
  max?:     number
  tone?:    Tone
  className?: string
}

export function SensitivityChips({
  items,
  max,
  tone = 'warning',
  className,
}: SensitivityChipsProps) {
  if (!items || items.length === 0) return null
  const visible  = typeof max === 'number' ? items.slice(0, max) : items
  const overflow = typeof max === 'number' ? Math.max(0, items.length - max) : 0
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`.trim()}>
      {visible.map((label) => (
        <VerdictBadge key={label} tone={tone} size="sm">
          {label}
        </VerdictBadge>
      ))}
      {overflow > 0 ? (
        <VerdictBadge tone="neutral" size="sm">
          +{overflow}
        </VerdictBadge>
      ) : null}
    </div>
  )
}
