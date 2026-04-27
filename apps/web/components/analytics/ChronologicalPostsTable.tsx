'use client'
import Link from 'next/link'
import { FORMAT_LABEL } from '@/features/analytics/utils'
import {
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
  type TDistributionLabel,
  type TDistributionSignal,
} from '@/features/analytics/engagement-score'
import { primaryThemeLabel } from '@/features/content-lab/content-analysis-labels'
import type { TChronologicalPost } from '@/features/analytics/get-chronological-posts'

const SIGNAL_GLYPH: Record<TDistributionSignal, string> = {
  shares:        '↗',
  saves:         '◆',
  comments:      '✎',
  likes:         '♥',
  profileVisits: '@',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
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
    // through next/image (which caches) would surface stale 403s.
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

function CirculationCell({
  score,
  label,
  dominantSignal,
}: {
  score:          number | null
  label:          TDistributionLabel | null
  dominantSignal: TDistributionSignal | null
}) {
  if (score == null || label == null) {
    return <span className="text-xs text-neutral-600">—</span>
  }
  const cls = DISTRIBUTION_LABEL_CLASS[label]
  return (
    <span
      title={`Score circulation ${score}/100 — ${DISTRIBUTION_LABEL_FR[label]}`}
      className={`inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[11px] font-medium ${cls}`}
    >
      <span className="tabular-nums">{score}</span>
      {dominantSignal && (
        <span className="text-[10px] opacity-70" aria-hidden>{SIGNAL_GLYPH[dominantSignal]}</span>
      )}
    </span>
  )
}

export function ChronologicalPostsTable({ posts }: { posts: TChronologicalPost[] }) {
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
            <th className="px-3 py-3 text-left  text-xs font-medium text-neutral-500"></th>
            <th className="px-3 py-3 text-left  text-xs font-medium text-neutral-500">Date</th>
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
            <th
              className="px-4 py-3 text-right text-xs font-medium text-neutral-500"
              title="Score circulation 0–100 — vs ta baseline 30j du même format. Vide quand le post n'a pas encore de reach."
            >
              Score circulation
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 bg-neutral-950">
          {posts.map((post) => (
            <tr key={post.id} className="transition-colors hover:bg-neutral-900/60">
              <td className="py-2 pl-3 pr-1">
                <Link href={`/analytics/post/${post.id}`} className="inline-block">
                  <PreviewThumb previewUrl={post.previewUrl} mediaType={post.mediaType} />
                </Link>
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-xs tabular-nums text-neutral-400">
                {formatDate(post.postedAt)}
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
                {post.primaryTheme && post.primaryTheme !== 'unknown' && (
                  <span
                    className="mt-1 inline-flex items-center rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-400"
                    title="Thème principal détecté par l'analyse de contenu"
                  >
                    {primaryThemeLabel(post.primaryTheme)}
                  </span>
                )}
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
                <CirculationCell
                  score={post.circulationScore}
                  label={post.circulationLabel}
                  dominantSignal={post.dominantSignal}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-neutral-800 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-600">
        Posts ordonnés par date de publication. Lien → fiche post pour le détail complet.
      </p>
    </div>
  )
}
