import Link from 'next/link'
import type { AutomationSummary } from '@creator-hub/types'
import { formatRelative } from '@/features/automations/utils'

type Props = {
  summary: AutomationSummary
  description?: string
  note?: string
}

function statusPill(summary: AutomationSummary): { label: string; tone: 'ok' | 'warn' | 'fail' | 'idle' } {
  if (!summary.lastRun) return { label: 'never run', tone: 'idle' }
  if (summary.lastRun.status === 'failed')  return { label: 'failed', tone: 'fail' }
  if (summary.lastRun.status === 'skipped') return { label: 'skipped', tone: 'warn' }
  return { label: 'success', tone: 'ok' }
}

const TONE_CLASSES: Record<'ok' | 'warn' | 'fail' | 'idle', string> = {
  ok:   'bg-emerald-900/30 text-emerald-300 border-emerald-800/60',
  warn: 'bg-amber-900/30 text-amber-300 border-amber-800/60',
  fail: 'bg-red-900/30 text-red-300 border-red-800/60',
  idle: 'bg-neutral-900 text-neutral-400 border-neutral-800',
}

export function AutomationStatusCard({ summary, description, note }: Props) {
  const pill = statusPill(summary)

  return (
    <Link
      href={`/automations/${encodeURIComponent(summary.name)}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{summary.name}</p>
          {description && (
            <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONE_CLASSES[pill.tone]}`}>
          {pill.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
        <span>last run · {formatRelative(summary.lastRun?.ranAt ?? null)}</span>
        {summary.lastFailure && (
          <span className="text-red-400">
            last fail · {formatRelative(summary.lastFailure.ranAt)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs tabular-nums">
        <span className="text-emerald-400">{summary.runs7d.success}✓</span>
        <span className="text-red-400">{summary.runs7d.failed}✗</span>
        <span className="text-amber-400">{summary.runs7d.skipped}⏭</span>
        <span className="text-neutral-500">/ 7d</span>
      </div>

      {note && (
        <p className="mt-3 rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-[11px] text-neutral-500">
          {note}
        </p>
      )}
    </Link>
  )
}
