import type { TDataHealth } from '@/features/analytics/get-data-health'

const NBSP = ' '

function formatInt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('fr-FR')
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return '—'
  const diffMs = Date.now() - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 60)       return `il y a ${sec}${NBSP}s`
  const min = Math.round(sec / 60)
  if (min < 60)       return `il y a ${min}${NBSP}min`
  const hr  = Math.round(min / 60)
  if (hr  < 24)       return `il y a ${hr}${NBSP}h`
  const day = Math.round(hr  / 24)
  if (day < 7)        return `il y a ${day}${NBSP}j`
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'short' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">Aucun</span>
  }
  const cls =
    status === 'success' ? 'bg-emerald-500/15 text-emerald-400' :
    status === 'failed'  ? 'bg-red-500/15     text-red-400'     :
    status === 'skipped' ? 'bg-amber-500/15   text-amber-400'   :
                           'bg-neutral-800    text-neutral-300'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  )
}

export function DataHealthPanel({ health, period }: { health: TDataHealth; period: number }) {
  const { account, lastSync } = health
  const displayName = account?.username ? `@${account.username}` : '— aucun compte connecté'

  const martStatus: 'ok' | 'empty' =
    health.martRowCount > 0 ? 'ok' : 'empty'

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-block h-2 w-2 rounded-full bg-emerald-500"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white" title={account?.instagramId ?? undefined}>
              {displayName}
            </p>
            <p className="text-[11px] text-neutral-500">
              Compte Instagram connecté
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Dernier sync</p>
            <p
              className="text-xs text-neutral-300"
              title={formatDateTime(lastSync.at)}
            >
              {formatRelative(lastSync.at)}
            </p>
          </div>
          <StatusBadge status={lastSync.status} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-3 text-xs sm:grid-cols-4 lg:grid-cols-7">
        <HealthStat
          label="Posts indexés"
          value={formatInt(health.totalPosts)}
        />
        <HealthStat
          label={`Posts (${period}${NBSP}j)`}
          value={formatInt(health.periodPosts)}
        />
        <HealthStat
          label="Posts avec métriques"
          value={formatInt(health.postsWithMetrics)}
          hint={
            health.totalPosts > 0
              ? `${Math.round((health.postsWithMetrics / health.totalPosts) * 100)}% du stock`
              : undefined
          }
        />
        <HealthStat
          label="raw_instagram_media"
          value={formatInt(health.rawMediaCount)}
        />
        <HealthStat
          label="raw insights"
          value={formatInt(health.rawInsightsCount)}
        />
        <HealthStat
          label="Lignes mart"
          value={formatInt(health.martRowCount)}
          tone={martStatus === 'empty' ? 'warn' : 'ok'}
          hint={martStatus === 'empty' ? 'v_mart_post_performance vide' : undefined}
        />
        <HealthStat
          label="Sync limit"
          value={health.mediaSyncLimit != null ? formatInt(health.mediaSyncLimit) : '—'}
          hint={
            health.mediaSyncLimit != null
              ? 'Dernier run sync-media'
              : 'Dernier run non parsable'
          }
        />
      </dl>

      {lastSync.errorMessage && (
        <p className="border-t border-red-500/20 bg-red-500/5 px-5 py-2 text-[11px] text-red-400">
          Dernière erreur sync :{' '}
          <span className="text-red-300">{lastSync.errorMessage.slice(0, 240)}</span>
        </p>
      )}
      {lastSync.summary?.errors && lastSync.summary.errors.length > 0 && (
        <p className="border-t border-amber-500/20 bg-amber-500/5 px-5 py-2 text-[11px] text-amber-400">
          {lastSync.summary.errors.length} erreur
          {lastSync.summary.errors.length > 1 ? 's' : ''} partielle
          {lastSync.summary.errors.length > 1 ? 's' : ''} au dernier sync
          {typeof lastSync.summary.durationMs === 'number' && (
            <> · {Math.round(lastSync.summary.durationMs / 1000)}{NBSP}s total</>
          )}
        </p>
      )}
    </div>
  )
}

function HealthStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'warn'
}) {
  const valueCls =
    tone === 'warn' ? 'text-amber-400' : 'text-neutral-200'
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${valueCls}`}>
        {value}
      </dd>
      {hint && (
        <p className="mt-0.5 truncate text-[10px] text-neutral-600">{hint}</p>
      )}
    </div>
  )
}
