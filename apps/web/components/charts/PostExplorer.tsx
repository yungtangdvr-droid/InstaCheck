'use client'
import Link from 'next/link'
import { FORMAT_LABEL } from '@/features/analytics/utils'
import {
  RANK_LABEL_CLASS,
  RANK_LABEL_FR,
  rankLabel,
  type TRankLabel,
} from '@/features/analytics/ranking'
import {
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import { primaryThemeLabel } from '@/features/content-lab/content-analysis-labels'
import type { TTopPost } from '@creator-hub/types'

// Compact 1–2 char glyph used inside the badge to flag the dominant signal
// without taking a full column. Hover tooltip carries the full word.
const SIGNAL_GLYPH: Record<TDistributionSignal, string> = {
  shares:        '↗',
  saves:         '◆',
  comments:      '✎',
  likes:         '♥',
  profileVisits: '@',
}

type Props = {
  posts: TTopPost[]
  // Optional read-only signal from post_content_analysis.primary_theme,
  // keyed by post id. Plain Record so it serialises across the RSC boundary.
  // Posts without a completed analysis are simply absent from the map.
  themesByPostId?: Record<string, string | null>
}

function MultiplierChip({ multiplier }: { multiplier: number | null }) {
  if (multiplier == null) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const cls =
    multiplier >= 1.5 ? 'text-success'         :
    multiplier >= 0.8 ? 'text-foreground'      :
                        'text-danger'
  return (
    <span
      className={`text-xs font-medium tabular-nums ${cls}`}
      title="Saves du post ÷ saves moyens du même format sur 30 jours"
    >
      ×{multiplier.toFixed(1)}
    </span>
  )
}

function RankBadge({
  label,
  percentile,
  rankScore,
  absoluteScore,
  scoreDelta,
}: {
  label: TRankLabel | null
  percentile: number | null
  rankScore: number | null
  absoluteScore: number
  scoreDelta: number
}) {
  const tooltipParts = [
    percentile != null ? `Percentile ${percentile} dans la période` : null,
    rankScore != null  ? `Ratio baseline ×${rankScore.toFixed(2)}`  : null,
    `Score mart ${absoluteScore}/100 (Δ ${scoreDelta >= 0 ? '+' : ''}${scoreDelta})`,
  ].filter(Boolean)
  const tooltip = tooltipParts.join(' · ')

  if (label == null) {
    return (
      <span
        title={tooltip + ' — échantillon insuffisant pour un rang'}
        className="inline-flex h-6 items-center rounded border border-border bg-muted px-1.5 text-[11px] text-muted-foreground"
      >
        —
      </span>
    )
  }

  return (
    <span
      title={tooltip}
      className={`inline-flex h-6 items-center rounded border px-1.5 text-[11px] font-medium ${RANK_LABEL_CLASS[label]}`}
    >
      {RANK_LABEL_FR[label]}
    </span>
  )
}

function CirculationBadge({
  score,
  label,
  dominantSignal,
}: {
  score:          number
  label:          TDistributionLabel
  dominantSignal: TDistributionSignal | null
}) {
  const cls = DISTRIBUTION_LABEL_CLASS[label]
  const signalFr = dominantSignal ? DISTRIBUTION_SIGNAL_FR[dominantSignal] : null
  // Self-relative tooltip: explicitly anchors the label against the per-format
  // 30 j baseline so the reading can never be confused with an absolute judgment.
  const baselineQualifier = 'vs ta baseline 30j du même format'
  const tooltip = signalFr
    ? `Score circulation ${score}/100 — ${DISTRIBUTION_LABEL_FR[label]} (${baselineQualifier}) · signal dominant : ${signalFr}`
    : `Score circulation ${score}/100 — ${DISTRIBUTION_LABEL_FR[label]} (${baselineQualifier})`
  return (
    <span
      title={tooltip}
      className={`inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] font-medium ${cls}`}
    >
      <span className="tabular-nums">{score}</span>
      <span className="text-[10px] opacity-80">{DISTRIBUTION_LABEL_FR[label]}</span>
      {dominantSignal && (
        <span className="text-[10px] opacity-70" aria-hidden>{SIGNAL_GLYPH[dominantSignal]}</span>
      )}
    </span>
  )
}

function PreviewThumb({
  previewUrl,
  mediaType,
}: {
  previewUrl: string | null
  mediaType:  string
}) {
  if (!previewUrl) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground"
        title="Aucun aperçu disponible"
      >
        {FORMAT_LABEL[mediaType]?.slice(0, 3).toUpperCase() ?? '—'}
      </div>
    )
  }
  return (
    // Plain <img>: Meta CDN URLs are short-lived and rotate, so pushing them
    // through next/image (which caches) would surface stale 403s. A broken
    // preview is better than a cached dead URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewUrl}
      alt=""
      loading="lazy"
      className="h-10 w-10 rounded object-cover"
      onError={(e) => {
        const el = e.currentTarget
        el.style.visibility = 'hidden'
      }}
    />
  )
}

export function PostExplorer({ posts, themesByPostId }: Props) {
  if (posts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        Aucun post dans cette période
      </div>
    )
  }

  const sampleSize = posts.filter(p => p.rankScore != null).length

  return (
    <div className="overflow-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-3 py-3 text-left  text-[11px] font-medium uppercase tracking-wide text-muted-foreground"></th>
            <th className="px-3 py-3 text-left  text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Format</th>
            <th
              className="px-4 py-3 text-left  text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Texte de la légende Instagram. Souvent vide pour les memes — le contenu éditorial est dans le visuel."
            >
              Légende IG
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reach</th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saves</th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Shares</th>
            <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">×saves</th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Score circulation 0–100, self-relative — taux shares/reach (50 %), saves/reach (25 %), comments/reach (10 %), likes/reach (10 %), profile_visits/reach (5 %), normalisés log vs ta baseline 30j du même format. Pas de comparaison externe."
            >
              Score
              <span className="ml-1 text-[10px] font-normal normal-case opacity-70">(vs baseline 30j)</span>
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Rang percentile du post dans la période, basé sur les ratios vs baseline 30 j (saves / shares / comments / likes / profile visits)."
            >
              Rang
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {posts.map((post) => {
            const label = rankLabel(post.percentile, sampleSize)
            return (
              <tr key={post.id} className="transition-colors hover:bg-muted/30">
                <td className="py-2 pl-3 pr-1">
                  <Link href={`/analytics/post/${post.id}`} className="inline-block">
                    <PreviewThumb previewUrl={post.previewUrl} mediaType={post.mediaType} />
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                    {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
                  </span>
                </td>
                <td className="max-w-xs px-4 py-3">
                  <Link
                    href={`/analytics/post/${post.id}`}
                    className="block truncate text-foreground hover:text-foreground/80"
                  >
                    {post.caption ?? <span className="italic text-muted-foreground">Sans légende IG</span>}
                  </Link>
                  {(() => {
                    const theme = themesByPostId?.[post.id]
                    if (!theme || theme === 'unknown') return null
                    return (
                      <span
                        className="mt-1 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title="Thème principal détecté par l'analyse de contenu"
                      >
                        {primaryThemeLabel(theme)}
                      </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {post.reach.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {post.saves.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {post.shares.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <MultiplierChip multiplier={post.savesMultiplier} />
                </td>
                <td className="px-4 py-3 text-right">
                  <CirculationBadge
                    score={post.engagementScore}
                    label={post.engagementLabel}
                    dominantSignal={post.dominantSignal}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <RankBadge
                    label={label}
                    percentile={post.percentile}
                    rankScore={post.rankScore}
                    absoluteScore={post.score}
                    scoreDelta={post.scoreDelta}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Rang = percentile du score UI (ratio pondéré vs baseline 30 j du même format).
        ×saves = multiplicateur des saves par rapport à cette baseline.
      </p>
    </div>
  )
}
