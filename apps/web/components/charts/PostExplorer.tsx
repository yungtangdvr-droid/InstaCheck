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

type Props = { posts: TTopPost[] }

function MultiplierChip({ multiplier }: { multiplier: number | null }) {
  if (multiplier == null) {
    return <span className="text-xs text-neutral-600">—</span>
  }
  const cls =
    multiplier >= 1.5 ? 'text-emerald-400' :
    multiplier >= 0.8 ? 'text-neutral-300' :
                        'text-red-400'
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
        className="inline-flex h-6 items-center rounded border border-neutral-800 bg-neutral-900 px-1.5 text-[11px] text-neutral-500"
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
  const tooltip = signalFr
    ? `Score circulation ${score}/100 — ${DISTRIBUTION_LABEL_FR[label]} · signal dominant : ${signalFr}`
    : `Score circulation ${score}/100 — ${DISTRIBUTION_LABEL_FR[label]}`
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
        className="flex h-10 w-10 items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-500"
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

export function PostExplorer({ posts }: Props) {
  if (posts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
        Aucun post dans cette période
      </div>
    )
  }

  const sampleSize = posts.filter(p => p.rankScore != null).length

  return (
    <div className="overflow-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900">
            <th className="px-3 py-3 text-left  text-xs font-medium text-neutral-500"></th>
            <th className="px-3 py-3 text-left  text-xs font-medium text-neutral-500">Format</th>
            <th
              className="px-4 py-3 text-left  text-xs font-medium text-neutral-500"
              title="Texte de la légende Instagram. Souvent vide pour les memes — le contenu éditorial est dans le visuel."
            >
              Légende IG
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Reach</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Saves</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Shares</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">×saves</th>
            <th
              className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
              title="Score circulation 0–100 — taux shares/reach (50 %), saves/reach (25 %), comments/reach (10 %), likes/reach (10 %), profile_visits/reach (5 %), normalisés log vs baseline du même format."
            >
              Score circulation
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
              title="Rang percentile du post dans la période, basé sur les ratios vs baseline 30 j (saves / shares / comments / likes / profile visits)."
            >
              Rang
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {posts.map((post) => {
            const label = rankLabel(post.percentile, sampleSize)
            return (
              <tr key={post.id} className="transition-colors hover:bg-neutral-900/60">
                <td className="py-2 pl-3 pr-1">
                  <Link href={`/analytics/post/${post.id}`} className="inline-block">
                    <PreviewThumb previewUrl={post.previewUrl} mediaType={post.mediaType} />
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
                    {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
                  </span>
                </td>
                <td className="max-w-xs px-4 py-3">
                  <Link
                    href={`/analytics/post/${post.id}`}
                    className="block truncate text-neutral-300 hover:text-white"
                  >
                    {post.caption ?? <span className="italic text-neutral-600">Sans légende IG</span>}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                  {post.reach.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                  {post.saves.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
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
      <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-600">
        Rang = percentile du score UI (ratio pondéré vs baseline 30 j du même format).
        ×saves = multiplicateur des saves par rapport à cette baseline.
      </p>
    </div>
  )
}
