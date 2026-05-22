import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { ReachChart } from '@/components/charts/ReachChart'
import { SavesChart } from '@/components/charts/SavesChart'
import { PostExplorer } from '@/components/charts/PostExplorer'
import {
  getReachSeries,
  getTopPosts,
  getFormatBreakdown,
  getPreviousPeriodTotals,
} from '@/features/analytics/get-analytics-data'
import { getDataHealth } from '@/features/analytics/get-data-health'
import { getAccountEngagementHealth } from '@/features/analytics/get-engagement-health'
import { getContentSignalsForPosts } from '@/features/content-lab/get-content-analysis'
import { parsePeriod } from '@/features/analytics/utils'
import { buildHero } from '@/features/analytics/build-hero'
import { listPatternIdeas } from '@/features/content-lab/pattern-ideas/get-pattern-ideas'
import { PatternIdeaCard } from '@/features/content-lab/pattern-ideas/PatternIdeaCard'
import { listPatterns } from '@/features/content-lab/patterns/get-patterns'
import { buildPatternHeadline } from '@/features/content-lab/patterns/build-pattern-reason'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { KpiTile, type KpiTileDelta } from '@/components/ui/kpi-tile'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import type { TCreativePattern, TFormatSummary, TTopPost } from '@creator-hub/types'
import Link from 'next/link'

// Caps — Overview is a synthesis surface, not a directory.
const OVERVIEW_TOP_POSTS         = 5
const OVERVIEW_PATTERN_IDEAS     = 3
const ALERT_PENDING_THRESHOLD    = 10

const MEDIA_TYPE_LABEL: Record<string, string> = {
  IMAGE:          'Image',
  VIDEO:          'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
  REEL:           'Reel',
  STORY:          'Story',
}

const NBSP = ' '

function fmtInt(n: number): string {
  return n.toLocaleString('fr-FR')
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const diffMs = Date.now() - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 60)  return `il y a ${sec}${NBSP}s`
  const min = Math.round(sec / 60)
  if (min < 60)  return `il y a ${min}${NBSP}min`
  const hr  = Math.round(min / 60)
  if (hr  < 24)  return `il y a ${hr}${NBSP}h`
  const day = Math.round(hr / 24)
  if (day < 7)   return `il y a ${day}${NBSP}j`
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'short' })
}

// Conservative delta: returns null when prev is missing OR when previous total
// is 0 (would be division by zero / infinite ratio). Tone neutral when the
// movement is small enough to be noise (< 5 %).
function buildDelta(current: number, previous: number | null): KpiTileDelta | undefined {
  if (previous == null || previous <= 0) return undefined
  const ratio = (current - previous) / previous
  if (!Number.isFinite(ratio)) return undefined
  const pct = ratio * 100
  const sign = pct > 0 ? '+' : ''
  const tone: KpiTileDelta['tone'] =
    pct >= 5 ? 'positive' :
    pct <= -5 ? 'negative' :
    'neutral'
  return { value: `${sign}${pct.toFixed(0)}%`, tone }
}

function scoreDeltaTone(delta: number | null): KpiTileDelta | undefined {
  if (delta == null) return undefined
  if (Math.abs(delta) < 1) return { value: '±0', tone: 'neutral' }
  const sign = delta > 0 ? '+' : ''
  const tone: KpiTileDelta['tone'] =
    delta >=  5 ? 'positive' :
    delta <= -5 ? 'negative' :
    'neutral'
  return { value: `${sign}${Math.round(delta)} pts`, tone }
}

function pickTopReplicatePattern(patterns: TCreativePattern[]): TCreativePattern | null {
  const candidates = patterns.filter(
    p => p.recommendation === 'replicate' || p.recommendation === 'adapt',
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const aRep = a.recommendation === 'replicate' ? 0 : 1
    const bRep = b.recommendation === 'replicate' ? 0 : 1
    if (aRep !== bRep) return aRep - bRep
    if (a.bayesAdjustedScore !== b.bayesAdjustedScore) {
      return b.bayesAdjustedScore - a.bayesAdjustedScore
    }
    return b.sampleSize - a.sampleSize
  })
  return candidates[0]
}

function pickTopFormat(formats: TFormatSummary[]): TFormatSummary | null {
  const usable = formats.filter(f => f.count > 0 && (f.reach + f.saves + f.shares) > 0)
  if (usable.length === 0) return null
  // Saves are the cleanest "this resonates" signal; tie-break on reach.
  usable.sort((a, b) => {
    if (b.saves !== a.saves) return b.saves - a.saves
    return b.reach - a.reach
  })
  return usable[0]
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()

  const [
    health,
    engagement,
    reachResult,
    topPostsResult,
    formatsResult,
    prevTotalsResult,
    ideas,
    allPatterns,
  ] = await Promise.all([
    getDataHealth(supabase, period),
    getAccountEngagementHealth(supabase, period),
    getReachSeries(supabase, period),
    getTopPosts(supabase, period, OVERVIEW_TOP_POSTS),
    getFormatBreakdown(supabase, period),
    getPreviousPeriodTotals(supabase, period),
    listPatternIdeas(supabase, OVERVIEW_PATTERN_IDEAS),
    listPatterns(supabase),
  ])

  const reachData = reachResult.data    ?? []
  const topPosts  = topPostsResult.data  ?? []
  const formats   = formatsResult.data   ?? []
  const prevTotals = prevTotalsResult.data ?? null

  const signalMap = await getContentSignalsForPosts(supabase, topPosts.map(p => p.id))
  const themesByPostId: Record<string, string | null> = {}
  for (const [postId, signal] of signalMap) {
    themesByPostId[postId] = signal.primaryTheme
  }

  const totalReach = reachData.reduce((s, d) => s + d.reach, 0)
  const totalSaves = reachData.reduce((s, d) => s + d.saves, 0)

  const accountHandle = health.account?.username
    ? `@${health.account.username}`
    : null

  const topPost:    TTopPost | null         = topPosts[0]            ?? null
  const topPattern: TCreativePattern | null = pickTopReplicatePattern(allPatterns)
  const topFormat:  TFormatSummary | null   = pickTopFormat(formats)
  const topIdea = ideas[0] ?? null

  const hero = buildHero({
    period,
    lastSyncStatus:        health.lastSync.status,
    lastSyncErrorMessage:  health.lastSync.errorMessage,
    lastSyncErrorsCount:   health.lastSync.summary?.errors?.length ?? 0,
    periodPosts:           health.periodPosts,
    hasReach:              engagement.current.hasReach,
    engagementScore:       engagement.current.hasReach ? engagement.current.score : null,
    engagementLabel:       engagement.current.hasReach ? engagement.current.label : null,
    engagementDelta:       engagement.scoreDelta,
    dominantSignal:        engagement.current.dominantSignal,
    baselineQualifier:     engagement.baselineQualifier,
    topIdea,
    topPostSavesMultiplier: topPost?.savesMultiplier ?? null,
  })

  // Alert is only rendered for actionable issues. All other paths show a tiny
  // muted "data OK" line — operator doesn't need to scan pipeline diagnostics
  // when nothing is broken.
  const alertReasons: string[] = []
  if (health.lastSync.status === 'failed') alertReasons.push('Dernier sync en échec')
  if (health.lastSync.errorMessage)        alertReasons.push('Erreur sync remontée')
  const partialErrors = health.lastSync.summary?.errors?.length ?? 0
  if (partialErrors > 0) alertReasons.push(`${partialErrors} erreur${partialErrors > 1 ? 's' : ''} partielle${partialErrors > 1 ? 's' : ''} au dernier sync`)
  if (health.periodPosts === 0) alertReasons.push(`Aucun post sur ${period}${NBSP}j`)
  if (health.postsPendingContentAnalysis >= ALERT_PENDING_THRESHOLD) {
    alertReasons.push(`${health.postsPendingContentAnalysis} posts en attente d’analyse`)
  }
  const hasAlert = alertReasons.length > 0

  const engagementDeltaPill = scoreDeltaTone(engagement.scoreDelta)

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={accountHandle ?? 'Compte non connecté'}
        title="Overview"
        description="L’essentiel de tes performances en un coup d’œil."
        actions={<PeriodFilter current={period} />}
      />

      {/* 1 — Hero / next best action ----------------------------------- */}
      <section>
        <Card>
          <CardContent className="space-y-2 px-5 py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Signal principal · {period}{NBSP}j
            </p>
            <p className="text-xl font-semibold leading-snug tracking-tight text-card-foreground">
              {hero.headline}
            </p>
            {hero.secondary ? (
              <p className="text-sm text-muted-foreground">{hero.secondary}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* 2 — Compact KPI strip ----------------------------------------- */}
      <section className="space-y-3">
        <SectionHeader
          eyebrow={`${period}${NBSP}j`}
          title="Indicateurs clés"
          description="Volumes mesurés sur la période active."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Santé circulation"
            value={engagement.current.hasReach ? engagement.current.score : '—'}
            unit={engagement.current.hasReach ? '/100' : undefined}
            delta={engagementDeltaPill}
            hint={engagement.current.hasReach ? engagement.baselineQualifier : 'Pas assez de données'}
          />
          <KpiTile
            label="Posts"
            value={fmtInt(health.periodPosts)}
            delta={buildDelta(health.periodPosts, prevTotals?.postsCount ?? null)}
            hint={
              health.totalPosts > 0
                ? `${fmtInt(health.totalPosts)} indexés au total`
                : undefined
            }
          />
          <KpiTile
            label="Reach"
            value={totalReach > 0 ? fmtInt(totalReach) : '—'}
            delta={buildDelta(totalReach, prevTotals?.reach ?? null)}
          />
          <KpiTile
            label="Saves"
            value={totalSaves > 0 ? fmtInt(totalSaves) : '—'}
            delta={buildDelta(totalSaves, prevTotals?.saves ?? null)}
          />
        </div>
      </section>

      {/* 3 — Compact trend -------------------------------------------- */}
      {reachData.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Tendance"
            description={`Reach et engagement quotidiens sur ${period}${NBSP}j.`}
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reach</CardTitle>
              </CardHeader>
              <CardContent>
                <ReachChart data={reachData} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Saves · Shares</CardTitle>
              </CardHeader>
              <CardContent>
                <SavesChart data={reachData} />
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}

      {/* 4 — Ce qui marche ------------------------------------------- */}
      {topPost || topPattern || topFormat ? (
        <section className="space-y-3">
          <SectionHeader
            title="Ce qui marche"
            description="Les meilleurs signaux récents — à observer ou à dupliquer."
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {topPost ? <TopPostCard post={topPost} /> : null}
            {topPattern ? <TopPatternCard pattern={topPattern} /> : null}
            {topFormat ? <TopFormatCard format={topFormat} period={period} /> : null}
          </div>
        </section>
      ) : null}

      {/* 5 — À tester ensuite ---------------------------------------- */}
      {ideas.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="À tester ensuite"
            description="Pistes dérivées des familles créatives qui sur-performent."
            actions={
              <Link
                href="/content-lab/ideas"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Voir toutes les idées →
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {ideas.map(idea => (
              <PatternIdeaCard key={idea.sourcePatternKey} idea={idea} />
            ))}
          </div>
        </section>
      ) : null}

      {/* 6 — Attention / data health -------------------------------- */}
      <section className="space-y-2">
        {hasAlert ? (
          <Card className="border-warning/40 bg-warning-soft">
            <CardContent className="space-y-2 px-5 py-4">
              <div className="flex items-center gap-2">
                <VerdictBadge tone="warning" size="md">Attention</VerdictBadge>
                <p className="text-sm font-medium text-card-foreground">
                  Pipeline à vérifier
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-card-foreground">
                {alertReasons.map(reason => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {health.lastSync.errorMessage ? (
                <p className="text-xs text-muted-foreground">
                  Dernier message : {health.lastSync.errorMessage.slice(0, 240)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">
            Données à jour · dernier sync {fmtRelative(health.lastSync.at)}
            {health.account?.username ? ` · @${health.account.username}` : ''}
          </p>
        )}
      </section>

      {/* 7 — Top posts (demoted) ------------------------------------ */}
      {topPosts.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title={`Top posts — ${period}${NBSP}j`}
            description="Top circulation sur la période."
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/analytics/posts?period=${period}`}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Voir tous les posts →
                </Link>
                <Link
                  href={`/analytics/formats?period=${period}`}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Vue par format →
                </Link>
                <Link
                  href="/analytics/benchmark"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Vue benchmark →
                </Link>
              </div>
            }
          />
          <PostExplorer posts={topPosts} themesByPostId={themesByPostId} />
        </section>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- *
 * Mini-cards for the "Ce qui marche" row. Inline (page-local) so we
 * don't grow the component tree for one-off Overview tiles.
 * ----------------------------------------------------------------- */

function TopPostCard({ post }: { post: TTopPost }) {
  const captionExcerpt = (post.caption ?? '').replace(/\s+/g, ' ').slice(0, 90)
  const mult = post.savesMultiplier
  const multStr =
    mult != null && Number.isFinite(mult) && mult > 0
      ? `×${mult.toFixed(2)} saves vs format`
      : `${fmtInt(post.saves)} saves`
  return (
    <Card>
      <CardContent className="space-y-2 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Top post
          </p>
          <VerdictBadge tone="success" size="sm">
            {MEDIA_TYPE_LABEL[post.mediaType] ?? post.mediaType}
          </VerdictBadge>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-card-foreground">
          {captionExcerpt || 'Sans légende'}
        </p>
        <p className="text-xs text-muted-foreground">
          {fmtInt(post.reach)} reach · {multStr}
        </p>
        <Link
          href={`/analytics/post/${post.id}`}
          className="inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Voir le post →
        </Link>
      </CardContent>
    </Card>
  )
}

function TopPatternCard({ pattern }: { pattern: TCreativePattern }) {
  const recoTone = pattern.recommendation === 'replicate' ? 'success' : 'warning'
  const recoLabel = pattern.recommendation === 'replicate' ? 'À répliquer' : 'À adapter'
  const savesMult = pattern.meanSavesMultiplier
  return (
    <Card>
      <CardContent className="space-y-2 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Top pattern
          </p>
          <VerdictBadge tone={recoTone} size="sm">{recoLabel}</VerdictBadge>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-card-foreground">
          {buildPatternHeadline(pattern)}
        </p>
        <p className="text-xs text-muted-foreground">
          {pattern.sampleSize} post{pattern.sampleSize > 1 ? 's' : ''} ·
          {' '}score {Math.round(pattern.bayesAdjustedScore)}/100
          {savesMult != null && Number.isFinite(savesMult) && savesMult > 0
            ? ` · saves ×${savesMult.toFixed(2)}`
            : ''}
        </p>
        <Link
          href={`/content-lab/patterns/${encodeURIComponent(pattern.patternKey)}`}
          className="inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Voir la famille →
        </Link>
      </CardContent>
    </Card>
  )
}

function TopFormatCard({ format, period }: { format: TFormatSummary; period: number }) {
  const label = MEDIA_TYPE_LABEL[format.mediaType] ?? format.mediaType
  return (
    <Card>
      <CardContent className="space-y-2 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Meilleur format
          </p>
          <VerdictBadge tone="info" size="sm">{label}</VerdictBadge>
        </div>
        <p className="text-sm font-medium text-card-foreground">
          {fmtInt(format.saves)} saves · {fmtInt(format.shares)} shares
        </p>
        <p className="text-xs text-muted-foreground">
          {format.count} post{format.count > 1 ? 's' : ''} · {fmtInt(format.reach)} reach
        </p>
        <Link
          href={`/analytics/formats?period=${period}`}
          className="inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Vue par format →
        </Link>
      </CardContent>
    </Card>
  )
}
