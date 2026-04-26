import {
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
} from '@/features/analytics/engagement-score'
import type { TAccountEngagementHealth } from '@/features/analytics/get-engagement-health'

function pct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

export function AccountEngagementCard({
  health,
  period,
}: {
  health: TAccountEngagementHealth
  period: number
}) {
  const { current, baseline, baselinePeriod, baselineQualifier, scoreDelta, interpretation, postCount, highPerformerCount } = health
  const labelCls = DISTRIBUTION_LABEL_CLASS[current.label]
  const labelFr  = DISTRIBUTION_LABEL_FR[current.label]
  const dominantFr = current.dominantSignal
    ? DISTRIBUTION_SIGNAL_FR[current.dominantSignal]
    : null

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
            Santé de circulation — {period} j
          </p>
          <p className="mt-1 text-sm text-neutral-300">{interpretation}</p>
          {dominantFr && current.hasReach && (
            <p className="mt-1 text-[11px] text-neutral-500">
              Signal dominant : <span className="text-neutral-300">{dominantFr}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`inline-flex h-7 items-center rounded border px-2 text-xs font-medium ${labelCls}`}
          >
            {labelFr}
          </span>
          <span className="text-[10px] text-neutral-500" title="Le score est self-relative : il compare le compte à son propre historique, pas à un benchmark externe.">
            {baselineQualifier}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-6">
        <div className="col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Score circulation</p>
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

        {/* v2 composite breakdown — explicitly labelled so the operator can see
            why the single score moved (median post, % top, share rate, regularity). */}
        <ComponentTile
          label="Médiane post"
          value={`${current.components.medianPostScore}`}
          suffix="/100"
          accent={current.components.medianPostScore >= 65}
          title="Score médian de circulation des posts publiés sur la période (40 % du score global)."
        />
        <ComponentTile
          label="% au-dessus"
          value={`${current.components.pctHighPerformers}%`}
          accent={current.components.pctHighPerformers >= 30}
          title={`Part des posts au-dessus de ta baseline (score ≥ 65, 30 % du score global). ${highPerformerCount}/${postCount} post${postCount > 1 ? 's' : ''}.`}
        />
        <ComponentTile
          label="Shares globaux"
          value={`${current.components.globalShareRateScore}`}
          suffix="/100"
          accent={current.components.globalShareRateScore >= 50}
          title="Taux de partages global du compte vs fenêtre de référence (20 % du score global)."
        />
        <ComponentTile
          label="Régularité"
          value={`${current.components.consistency}`}
          suffix="/100"
          accent={current.components.consistency >= 60}
          title="Pénalise les écarts entre posts. 100 = scores très homogènes (10 % du score global)."
        />
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-neutral-800 px-5 py-3 sm:grid-cols-5">
        <RateTile label="Shares"   value={pct(current.rates.shares)}   accent={current.dominantSignal === 'shares'} />
        <RateTile label="Saves"    value={pct(current.rates.saves)}    accent={current.dominantSignal === 'saves'} />
        <RateTile label="Comments" value={pct(current.rates.comments)} accent={current.dominantSignal === 'comments'} />
        <RateTile label="Likes"    value={pct(current.rates.likes)}    accent={current.dominantSignal === 'likes'} />
        <RateTile
          label="Profil"
          value={pct(current.rates.profileVisits)}
          accent={current.dominantSignal === 'profileVisits'}
        />
      </div>
    </div>
  )
}

function ComponentTile({
  label,
  value,
  suffix,
  accent,
  title,
}: {
  label:   string
  value:   string
  suffix?: string
  accent?: boolean
  title?:  string
}) {
  return (
    <div className="min-w-0" title={title}>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`text-base font-semibold tabular-nums ${
            accent ? 'text-emerald-400' : 'text-neutral-200'
          }`}
        >
          {value}
        </span>
        {suffix && <span className="text-[10px] text-neutral-500">{suffix}</span>}
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
        title={accent ? 'Signal dominant' : undefined}
      >
        {value}
      </p>
    </div>
  )
}
