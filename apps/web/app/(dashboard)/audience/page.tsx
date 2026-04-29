import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { getAudienceData } from '@/features/audience/get-audience'
import { parsePeriod, FORMAT_LABEL } from '@/features/analytics/utils'
import { baselineQualifierFor } from '@/features/analytics/get-engagement-health'
import {
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
} from '@/features/analytics/engagement-score'
import type {
  TAudienceFormatRate,
  TAudienceTopPost,
} from '@/features/audience/get-audience'
import type {
  TAudienceBreakdownState,
  TAudienceDemographicBreakdown,
} from '@creator-hub/types'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { KpiTile } from '@/components/ui/kpi-tile'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import { EmptyState } from '@/components/ui/empty-state'

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const VERDICT_TONE: Record<TDistributionLabel, NonNullable<VerdictBadgeProps['tone']>> = {
  'faible':       'danger',
  'moyen':        'warning',
  'bon':          'success',
  'tres-fort':    'success',
  'exceptionnel': 'success',
}

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()
  const audience = await getAudienceData(supabase, period)

  // Mirrors the baseline-window selection in getAccountEngagementHealth:
  // period 7 → 30j window, period 30 → 90j window, period 90 → no longer
  // window so we fall through to "vs ton historique récent".
  const baselinePeriod: 30 | 90 | null =
    audience.period === 7  ? 30 :
    audience.period === 30 ? 90 :
                             null
  const baselineQualifier = baselineQualifierFor(baselinePeriod)

  // Mirrors AccountEngagementCard: only render the verdict label when we have
  // a baseline window AND enough posts in the period to make the delta honest.
  // Below the threshold we drop the badge and tell the operator the comparison
  // can't be trusted yet.
  const MIN_POSTS_FOR_VERDICT = 5
  const hasVerdict =
    baselinePeriod != null && audience.postsAnalyzed >= MIN_POSTS_FOR_VERDICT

  const circulationLabel: TDistributionLabel = audience.engagementLabel as TDistributionLabel
  // Soften the alarmist 'faible' label — same rationale as the analytics card.
  const displayedLabel: TDistributionLabel | null = !hasVerdict
    ? null
    : circulationLabel === 'faible' ? 'moyen' : circulationLabel
  const labelFr   = displayedLabel ? DISTRIBUTION_LABEL_FR[displayedLabel] : null
  const labelTone = displayedLabel ? VERDICT_TONE[displayedLabel]          : null
  const dominantFr = audience.dominantSignal
    ? DISTRIBUTION_SIGNAL_FR[audience.dominantSignal]
    : null

  // The default interpretation copy embeds the verdict label ("Très sous ta
  // baseline …"). When we suppress the verdict above we also have to swap the
  // copy or the page contradicts itself.
  const interpretation = hasVerdict
    ? audience.interpretation
    : audience.postsAnalyzed === 0
      ? 'Aucun post analysé sur la période.'
      : 'Aucune fenêtre baseline fiable pour cette période — voir les taux observés ci-dessous.'

  const handle = audience.account?.username ? `@${audience.account.username}` : '—'

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={handle}
        title="Audience"
        description="Comportement de ton audience sur la base des données Meta officielles."
        actions={<PeriodFilter current={period} />}
      />

      {/* Audience overview */}
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Vue d&apos;ensemble</CardTitle>
            <CardDescription>{interpretation}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiTile label="Compte" value={handle} />
              <KpiTile
                label="Followers"
                value={audience.followersCount != null ? audience.followersCount.toLocaleString('fr-FR') : '—'}
                hint={
                  audience.followersAt
                    ? `Snapshot ${new Date(audience.followersAt).toLocaleDateString('fr-FR')}`
                    : undefined
                }
              />
              <KpiTile
                label={`Posts analysés (${period} j)`}
                value={audience.postsAnalyzed.toLocaleString('fr-FR')}
              />
              <KpiTile
                label="Score circulation"
                value={audience.engagementScore}
                unit="/ 100"
                hint={
                  hasVerdict
                    ? baselineQualifier
                    : 'Comparaison indisponible — historique insuffisant.'
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {hasVerdict && labelFr && labelTone && (
                <VerdictBadge tone={labelTone}>{labelFr}</VerdictBadge>
              )}
              {dominantFr && (
                <span>
                  Signal dominant : <span className="text-foreground">{dominantFr}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Habits summary */}
      <Card>
        <CardHeader>
          <CardTitle>Habitudes — résumé</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-card-foreground">{audience.habitsSummary}</p>
        </CardContent>
      </Card>

      {/* Audience behavior */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Meilleur créneau</CardTitle>
          </CardHeader>
          <CardContent>
            {audience.bestWindow ? (
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {DAY_NAMES_FR[audience.bestWindow.dayOfWeek]}
                  {' '}
                  {String(audience.bestWindow.hour).padStart(2, '0')}h
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saves moyens / post : {audience.bestWindow.savesAvg.toLocaleString('fr-FR')}
                  {' · '}
                  {audience.bestWindow.postCount} post{audience.bestWindow.postCount > 1 ? 's' : ''}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Source : v_mart_best_posting_windows ({period} j, tous formats)
                </p>
              </div>
            ) : (
              <EmptyState
                title="Pas encore assez de posts publiés sur la période"
                description="Le créneau optimal se calcule sur l'historique de saves moyens par heure × jour."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posts qui circulent le plus</CardTitle>
          </CardHeader>
          <CardContent>
            {audience.topPosts.length === 0 ? (
              <EmptyState
                title="Aucun post avec circulation mesurable"
                description="Les posts sans reach mesurable sont exclus de ce classement."
              />
            ) : (
              <ul className="space-y-2">
                {audience.topPosts.map((p) => (
                  <TopPostRow key={p.postId} post={p} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FormatRatePanel
          title="Formats — taux de sauvegardes"
          subtitle="saves / reach par format sur la période"
          rows={audience.formatsBySaves}
          dimension="saves"
        />
        <FormatRatePanel
          title="Formats — taux de partages"
          subtitle="shares / reach par format sur la période"
          rows={audience.formatsByShares}
          dimension="shares"
        />
      </section>

      {/* Audience characteristics — demographics from follower_demographics */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <CardTitle>Démographie audience — 30 derniers jours</CardTitle>
            {audience.demographics.syncedAt && (
              <span className="text-[11px] text-muted-foreground">
                Snapshot du {new Date(audience.demographics.syncedAt).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
          <CardDescription>
            Source : insight officiel{' '}
            <code className="text-muted-foreground">follower_demographics</code>{' '}
            (timeframe <code className="text-muted-foreground">last_30_days</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DemographicsBlock title="Pays"   state={audience.demographics.country} breakdown="country" topN={5} />
            <DemographicsBlock title="Villes" state={audience.demographics.city}    breakdown="city"    topN={5} />
            <DemographicsBlock title="Âge"    state={audience.demographics.age}     breakdown="age"     topN={5} />
            <DemographicsBlock title="Genre"  state={audience.demographics.gender}  breakdown="gender"  topN={null} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const GENDER_LABEL: Record<string, string> = {
  F: 'Femmes',
  M: 'Hommes',
  U: 'Non spécifié',
}

function formatBreakdownKey(breakdown: TAudienceDemographicBreakdown, key: string, label: string | null): string {
  if (label) return label
  if (breakdown === 'gender') return GENDER_LABEL[key] ?? key
  return key
}

function DemographicsBlock({
  title,
  state,
  breakdown,
  topN,
}: {
  title:     string
  state:     TAudienceBreakdownState
  breakdown: TAudienceDemographicBreakdown
  topN:      number | null
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <DemographicsBody state={state} breakdown={breakdown} topN={topN} />
    </div>
  )
}

function DemographicsBody({
  state,
  breakdown,
  topN,
}: {
  state:     TAudienceBreakdownState
  breakdown: TAudienceDemographicBreakdown
  topN:      number | null
}) {
  if (state.state === 'not_synced') {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Données démographiques non encore synchronisées.
      </p>
    )
  }

  if (state.state === 'available_below_threshold') {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Sous le seuil Meta (~100 followers) — pas de répartition publiée pour cet axe.
        {state.reason ? <span className="ml-1 text-muted-foreground">{state.reason}</span> : null}
      </p>
    )
  }

  if (state.state === 'unavailable') {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Indisponible : <span className="text-foreground">{state.reason}</span>
      </p>
    )
  }

  const rows = topN == null ? state.rows : state.rows.slice(0, topN)
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map(r => (
        <li key={r.key} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate text-foreground" title={`${r.value.toLocaleString('fr-FR')} followers`}>
            {formatBreakdownKey(breakdown, r.key, r.label)}
          </span>
          <span className="w-24 shrink-0">
            <span className="block h-1.5 rounded bg-muted">
              <span
                className="block h-full rounded bg-success"
                style={{ width: `${Math.min(100, Math.max(2, r.share * 100))}%` }}
              />
            </span>
          </span>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {(r.share * 100).toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  )
}

function TopPostRow({ post }: { post: TAudienceTopPost }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50">
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
        {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
      </span>
      <Link
        href={`/analytics/post/${post.postId}`}
        className="flex-1 truncate text-sm text-foreground hover:text-foreground/80"
      >
        {post.caption ?? <span className="italic text-muted-foreground">Sans légende IG</span>}
      </Link>
      <span className="text-xs tabular-nums text-success" title="Score circulation">
        {post.engagementScore}
      </span>
    </li>
  )
}

function FormatRatePanel({
  title,
  subtitle,
  rows,
  dimension,
}: {
  title:    string
  subtitle: string
  rows:     TAudienceFormatRate[]
  dimension: 'saves' | 'shares'
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Pas encore de reach mesurable par format"
            description={subtitle}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const rate = dimension === 'saves' ? r.savesRate : r.sharesRate
            return (
              <li
                key={r.mediaType}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {FORMAT_LABEL[r.mediaType] ?? r.mediaType}
                </span>
                <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                  <span title="Posts dans cette tranche">
                    {r.postCount} post{r.postCount > 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-success">
                    {(rate * 100).toFixed(2)}%
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
