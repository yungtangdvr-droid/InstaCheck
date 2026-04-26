import {
  ENGAGEMENT_LABEL_CLASS,
  ENGAGEMENT_LABEL_FR,
} from '@/features/analytics/engagement-score'
import type { TAccountEngagementHealth } from '@/features/analytics/get-engagement-health'

function pct(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

export function AccountEngagementCard({
  health,
  period,
}: {
  health: TAccountEngagementHealth
  period: number
}) {
  const { current, baseline, baselinePeriod, scoreDelta, interpretation, postCount } = health
  const labelCls = ENGAGEMENT_LABEL_CLASS[current.label]
  const labelFr  = ENGAGEMENT_LABEL_FR[current.label]

  const deltaColor =
    scoreDelta == null   ? 'text-neutral-500' :
    scoreDelta >=  5     ? 'text-emerald-400' :
    scoreDelta >= -5     ? 'text-neutral-400' :
                           'text-red-400'
  const deltaSign = scoreDelta != null && scoreDelta > 0 ? '+' : ''

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 px-5 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Engagement — {period} j
          </p>
          <p className="mt-1 text-sm text-neutral-300">{interpretation}</p>
        </div>
        <span
          className={`inline-flex h-7 items-center rounded border px-2 text-xs font-medium ${labelCls}`}
        >
          {labelFr}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-6">
        <div className="col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Score</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-white">
              {current.hasReach ? current.score : '—'}
            </span>
            <span className="text-xs text-neutral-500">/ 100</span>
            {scoreDelta != null && current.hasReach && (
              <span
                className={`text-xs tabular-nums ${deltaColor}`}
                title={`Δ vs ${baselinePeriod} j`}
              >
                {deltaSign}{scoreDelta}
              </span>
            )}
          </div>
          {baseline && baselinePeriod && (
            <p className="mt-0.5 text-[11px] text-neutral-600">
              Base {baselinePeriod} j : {baseline.score}/100
            </p>
          )}
          {!baseline && (
            <p className="mt-0.5 text-[11px] text-neutral-600">
              {postCount > 0 ? 'Pas de fenêtre de référence' : 'Aucun post analysé'}
            </p>
          )}
        </div>

        <RateTile
          label="Saves"
          value={pct(current.rates.saves)}
          accent={current.strongestSignal === 'saves'}
        />
        <RateTile
          label="Shares"
          value={pct(current.rates.shares)}
          accent={current.strongestSignal === 'shares'}
        />
        <RateTile
          label="Comments"
          value={pct(current.rates.comments)}
          accent={current.strongestSignal === 'comments'}
        />
        <RateTile
          label="Likes"
          value={pct(current.rates.likes)}
          accent={current.strongestSignal === 'likes'}
        />
      </div>
    </div>
  )
}

function RateTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          accent ? 'text-emerald-400' : 'text-neutral-200'
        }`}
        title={accent ? 'Signal le plus fort' : undefined}
      >
        {value}
      </p>
    </div>
  )
}
