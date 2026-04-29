import {
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
} from '@/features/analytics/engagement-score'
import type { TAccountEngagementHealth } from '@/features/analytics/get-engagement-health'
import { VerdictBadge } from '@/components/ui/verdict-badge'

const VERDICT_TONE: Record<TDistributionLabel, 'danger' | 'warning' | 'success'> = {
  'faible':       'danger',
  'moyen':        'warning',
  'bon':          'success',
  'tres-fort':    'success',
  'exceptionnel': 'success',
}

// Minimum number of posts in the active period before we trust a comparative
// verdict. Below this we stop rendering the red/amber label and only show the
// raw rates — small samples produce alarmist deltas the operator can't act on.
const MIN_POSTS_FOR_VERDICT = 5

// Labels we never render in the loud red variant. The current baseline window
// (30 d for period == 7, 90 d for period == 30) overlaps the active window, so
// a "Très sous ta baseline" verdict is structurally biased; we re-route those
// to the neutral amber band.
const ALARM_LABELS: ReadonlySet<TDistributionLabel> = new Set(['faible'])

function pct(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

function softenLabel(label: TDistributionLabel): TDistributionLabel {
  return ALARM_LABELS.has(label) ? 'moyen' : label
}

export function AccountEngagementCard({
  health,
  period,
}: {
  health: TAccountEngagementHealth
  period: number
}) {
  const {
    current,
    baseline,
    baselinePeriod,
    baselineQualifier,
    scoreDelta,
    postCount,
    highPerformerCount,
  } = health

  // A verdict is only honest when we have BOTH a longer-window baseline AND
  // enough posts in the active period to make a delta meaningful. Otherwise
  // we suppress the badge and the score becomes purely descriptive.
  const hasVerdict =
    baseline != null && baselinePeriod != null && postCount >= MIN_POSTS_FOR_VERDICT

  const displayedLabel = hasVerdict ? softenLabel(current.label) : null
  const labelTone      = displayedLabel ? VERDICT_TONE[displayedLabel]           : null
  const labelFr        = displayedLabel ? DISTRIBUTION_LABEL_FR[displayedLabel]  : null

  const dominantFr = current.dominantSignal
    ? DISTRIBUTION_SIGNAL_FR[current.dominantSignal]
    : null

  // Δ colouring is also gated on `hasVerdict`. Without a clean baseline the
  // delta is null already, but we keep the same neutral colour ramp here so a
  // small negative delta on a low sample never goes red.
  const deltaColor =
    !hasVerdict || scoreDelta == null ? 'text-muted-foreground' :
    scoreDelta >=  5                  ? 'text-success'          :
    scoreDelta >= -5                  ? 'text-muted-foreground' :
                                        'text-warning'
  const deltaSign = scoreDelta != null && scoreDelta > 0 ? '+' : ''

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Signaux de circulation — {period} j
          </p>
          <p className="mt-1 text-sm text-card-foreground">
            Métriques observées sur la période. Pas de jugement absolu — ces taux décrivent
            comment ton audience interagit, sans benchmark externe.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {postCount.toLocaleString('fr-FR')} post{postCount > 1 ? 's' : ''} analysé{postCount > 1 ? 's' : ''}
        </div>
      </div>

      {/* Lead with the factual rates — the operator sees what's measured before
          any interpretation. */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-4 sm:grid-cols-5">
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

      {dominantFr && current.hasReach && (
        <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
          Signal dominant : <span className="text-foreground">{dominantFr}</span>
        </p>
      )}

      {/* Comparative section — demoted to a small footer band. Either shows a
          score + verdict (when the baseline is sound) or an honest disclaimer. */}
      <div className="border-t border-border bg-muted/30 px-5 py-3">
        {hasVerdict ? (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Comparaison</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-base font-semibold tabular-nums text-foreground">
                  {current.score}
                </span>
                <span className="text-[11px] text-muted-foreground">/ 100</span>
                {scoreDelta != null && (
                  <span
                    className={`text-[11px] tabular-nums ${deltaColor}`}
                    title={`Δ vs baseline ${baselinePeriod} j (Note : la fenêtre baseline englobe la période active, donc le delta est conservateur).`}
                  >
                    {deltaSign}{scoreDelta}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  Base {baselinePeriod} j : {baseline?.score ?? '—'}/100
                </span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                <ComponentChip
                  label="Médiane post"
                  value={`${current.components.medianPostScore}`}
                  title="Score médian de circulation des posts publiés sur la période (40 % du score global)."
                />
                <ComponentChip
                  label="% au-dessus"
                  value={`${current.components.pctHighPerformers}%`}
                  title={`Part des posts au-dessus de ta baseline (score ≥ 65, 30 % du score global). ${highPerformerCount}/${postCount} post${postCount > 1 ? 's' : ''}.`}
                />
                <ComponentChip
                  label="Shares globaux"
                  value={`${current.components.globalShareRateScore}`}
                  title="Taux de partages global du compte vs fenêtre de référence (20 % du score global)."
                />
                <ComponentChip
                  label="Régularité"
                  value={`${current.components.consistency}`}
                  title="Pénalise les écarts entre posts. 100 = scores très homogènes (10 % du score global)."
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {labelFr && labelTone && (
                <VerdictBadge tone={labelTone} size="md">
                  {labelFr}
                </VerdictBadge>
              )}
              <span
                className="text-[10px] text-muted-foreground"
                title="Le score est self-relative : il compare le compte à son propre historique, pas à un benchmark externe."
              >
                {baselineQualifier}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Comparaison</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comparaison indisponible : historique insuffisant.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {postCount < MIN_POSTS_FOR_VERDICT
                  ? `Moins de ${MIN_POSTS_FOR_VERDICT} posts dans la période — un delta serait trompeur.`
                  : 'Pas de fenêtre de référence plus longue disponible pour cette période.'}
              </p>
            </div>
            <span
              className="text-[10px] text-muted-foreground"
              title="Aucune fenêtre baseline non recouvrante n'a pu être construite."
            >
              {baselineQualifier}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ComponentChip({
  label,
  value,
  title,
}: {
  label: string
  value: string
  title?: string
}) {
  return (
    <div className="min-w-0" title={title}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-medium tabular-nums text-foreground">{value}</p>
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
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          accent ? 'text-success' : 'text-foreground'
        }`}
        title={accent ? 'Signal dominant' : undefined}
      >
        {value}
      </p>
    </div>
  )
}
