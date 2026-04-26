import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PeriodFilter } from '@/components/analytics/PeriodFilter'
import { getAudienceData } from '@/features/audience/get-audience'
import { parsePeriod, FORMAT_LABEL } from '@/features/analytics/utils'
import {
  DISTRIBUTION_LABEL_CLASS,
  DISTRIBUTION_LABEL_FR,
  DISTRIBUTION_SIGNAL_FR,
  type TDistributionLabel,
} from '@/features/analytics/engagement-score'
import type {
  TAudienceFormatRate,
  TAudienceTopPost,
} from '@/features/audience/get-audience'

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createServerSupabaseClient()
  const audience = await getAudienceData(supabase, period)

  const circulationLabel = audience.engagementLabel as TDistributionLabel
  const labelCls = DISTRIBUTION_LABEL_CLASS[circulationLabel]
  const labelFr  = DISTRIBUTION_LABEL_FR[circulationLabel]
  const dominantFr = audience.dominantSignal
    ? DISTRIBUTION_SIGNAL_FR[audience.dominantSignal]
    : null

  const handle = audience.account?.username ? `@${audience.account.username}` : '—'

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Audience</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Comportement de ton audience sur la base des données Meta officielles.
          </p>
        </div>
        <PeriodFilter current={period} />
      </div>

      {/* Audience overview */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
        <h2 className="text-sm font-medium text-neutral-300">Vue d&apos;ensemble</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Compte" value={handle} />
          <Stat
            label="Followers"
            value={audience.followersCount != null ? audience.followersCount.toLocaleString('fr-FR') : '—'}
            hint={
              audience.followersAt
                ? `Snapshot ${new Date(audience.followersAt).toLocaleDateString('fr-FR')}`
                : undefined
            }
          />
          <Stat
            label={`Posts analysés (${period} j)`}
            value={audience.postsAnalyzed.toLocaleString('fr-FR')}
          />
          <div>
            <p className="text-xs text-neutral-500">Santé de circulation</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums text-white">
                {audience.engagementScore}
              </span>
              <span className="text-xs text-neutral-500">/ 100</span>
            </div>
            <span
              className={`mt-1 inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${labelCls}`}
            >
              {labelFr}
            </span>
            {dominantFr && (
              <p className="mt-1 text-[11px] text-neutral-500">
                Signal dominant : <span className="text-neutral-300">{dominantFr}</span>
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-sm text-neutral-300">{audience.interpretation}</p>
      </section>

      {/* Habits summary */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
        <h2 className="text-sm font-medium text-neutral-300">Habitudes — résumé</h2>
        <p className="mt-2 text-sm text-neutral-300">{audience.habitsSummary}</p>
      </section>

      {/* Audience behavior */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
          <h3 className="text-sm font-medium text-neutral-300">Meilleur créneau</h3>
          {audience.bestWindow ? (
            <div className="mt-3">
              <p className="text-2xl font-semibold text-white">
                {DAY_NAMES_FR[audience.bestWindow.dayOfWeek]}
                {' '}
                {String(audience.bestWindow.hour).padStart(2, '0')}h
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Saves moyens / post : {audience.bestWindow.savesAvg.toLocaleString('fr-FR')}
                {' · '}
                {audience.bestWindow.postCount} post{audience.bestWindow.postCount > 1 ? 's' : ''}
              </p>
              <p className="mt-1 text-[11px] text-neutral-600">
                Source : v_mart_best_posting_windows ({period} j, tous formats)
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Pas encore assez de posts publiés sur la période.</p>
          )}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
          <h3 className="text-sm font-medium text-neutral-300">Posts qui circulent le plus</h3>
          {audience.topPosts.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucun post avec circulation mesurable.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {audience.topPosts.map((p) => (
                <TopPostRow key={p.postId} post={p} />
              ))}
            </ul>
          )}
        </div>
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

      {/* Audience characteristics — demographics empty state */}
      <section className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-sm font-medium text-neutral-300">Caractéristiques d&apos;audience</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {audience.demographics.reason}
        </p>
        <p className="mt-1 text-[11px] text-neutral-600">
          Les données d&apos;âge, de genre, de pays et de ville ne sont pas inférées
          depuis les posts. Elles viendront de l&apos;insight officiel
          {' '}<code className="text-neutral-500">follower_demographics</code>{' '}
          de l&apos;API Meta lorsque la sync sera étendue.
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-600">{hint}</p>}
    </div>
  )
}

function TopPostRow({ post }: { post: TAudienceTopPost }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
        {FORMAT_LABEL[post.mediaType] ?? post.mediaType}
      </span>
      <Link
        href={`/analytics/post/${post.postId}`}
        className="flex-1 truncate text-sm text-neutral-300 hover:text-white"
      >
        {post.caption ?? <span className="italic text-neutral-600">Sans légende IG</span>}
      </Link>
      <span className="text-xs tabular-nums text-emerald-400" title="Score circulation">
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
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
        <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
        <p className="mt-2 text-sm text-neutral-500">Pas encore de reach mesurable par format.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
      <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
      <p className="mt-1 text-[11px] text-neutral-500">{subtitle}</p>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => {
          const rate = dimension === 'saves' ? r.savesRate : r.sharesRate
          return (
            <li
              key={r.mediaType}
              className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm"
            >
              <span className="text-neutral-300">
                {FORMAT_LABEL[r.mediaType] ?? r.mediaType}
              </span>
              <span className="flex items-center gap-3 text-xs tabular-nums text-neutral-400">
                <span title="Posts dans cette tranche">
                  {r.postCount} post{r.postCount > 1 ? 's' : ''}
                </span>
                <span className="font-semibold text-emerald-400">
                  {(rate * 100).toFixed(2)}%
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
