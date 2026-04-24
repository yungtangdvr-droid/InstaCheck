'use client'
import Link from 'next/link'
import { FORMAT_LABEL } from '@/features/analytics/utils'
import type { TTopPost } from '@creator-hub/types'

type Props = { posts: TTopPost[] }

// score_delta is signed vs baseline (≈ 50). Bounded by the same upstream
// clamp as performance_score, so display it alongside savesMultiplier to
// break ties that would otherwise saturate the absolute score at 100.
function DeltaBadge({ delta, absolute }: { delta: number; absolute: number }) {
  const cls =
    delta >=  10 ? 'bg-emerald-500/15 text-emerald-400' :
    delta >= -10 ? 'bg-neutral-800   text-neutral-300'  :
                   'bg-red-500/15    text-red-400'
  const sign = delta > 0 ? '+' : ''
  return (
    <span
      title={`Score absolu: ${absolute}/100 (baseline 50). Delta = écart vs moyenne du format.`}
      className={`inline-flex h-6 items-center rounded px-1.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      {sign}{delta}
    </span>
  )
}

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

export function PostExplorer({ posts }: Props) {
  if (posts.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-500">
        Aucun post dans cette période
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900">
            <th className="px-4 py-3 text-left  text-xs font-medium text-neutral-500">Format</th>
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
            <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">Δ vs moy.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {posts.map((post) => (
            <tr key={post.id} className="transition-colors hover:bg-neutral-900/60">
              <td className="px-4 py-3">
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
                <DeltaBadge delta={post.scoreDelta} absolute={post.score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-600">
        Δ = écart de score vs la moyenne du format (50 = moyen).
        ×saves = multiplicateur des saves par rapport à la baseline 30 j du même format.
      </p>
    </div>
  )
}
