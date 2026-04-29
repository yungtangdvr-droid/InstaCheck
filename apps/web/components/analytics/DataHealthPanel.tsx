import type { TDataHealth } from '@/features/analytics/get-data-health'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { SyncNowButton } from './SyncNowButton'
import { AnalyzeNewButton } from './AnalyzeNewButton'

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
    return <VerdictBadge tone="neutral">Aucun</VerdictBadge>
  }
  const tone: 'success' | 'danger' | 'warning' | 'neutral' =
    status === 'success' ? 'success' :
    status === 'failed'  ? 'danger'  :
    status === 'skipped' ? 'warning' :
                           'neutral'
  return <VerdictBadge tone={tone}>{status}</VerdictBadge>
}

export function DataHealthPanel({ health, period }: { health: TDataHealth; period: number }) {
  const { account, lastSync } = health
  const displayName = account?.username ? `@${account.username}` : '— aucun compte connecté'

  const martStatus: 'ok' | 'empty' =
    health.martRowCount > 0 ? 'ok' : 'empty'

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-block h-2 w-2 rounded-full bg-success"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={account?.instagramId ?? undefined}>
              {displayName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Compte Instagram connecté
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dernier sync</p>
            <p
              className="text-xs text-foreground"
              title={formatDateTime(lastSync.at)}
            >
              {formatRelative(lastSync.at)}
            </p>
          </div>
          <StatusBadge status={lastSync.status} />
          <SyncNowButton />
          <AnalyzeNewButton pendingCount={health.postsPendingContentAnalysis} />
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
          label="Médias bruts"
          value={formatInt(health.rawMediaCount)}
          hint="Médias récupérés depuis Meta"
        />
        <HealthStat
          label="Insights bruts"
          value={formatInt(health.rawInsightsCount)}
          hint="Métriques renvoyées par Meta"
        />
        <HealthStat
          label="Lignes analytics"
          value={formatInt(health.martRowCount)}
          tone={martStatus === 'empty' ? 'warn' : 'ok'}
          hint={martStatus === 'empty' ? 'Aucune ligne analytics calculée' : undefined}
        />
        <HealthStat
          label="Limite sync"
          value={health.mediaSyncLimit != null ? formatInt(health.mediaSyncLimit) : '—'}
          hint={
            health.mediaSyncLimit != null
              ? 'Posts traités au dernier sync'
              : 'Dernier run non parsable'
          }
        />
      </dl>

      {lastSync.errorMessage && (
        <p className="border-t border-danger/20 bg-danger-soft px-5 py-2 text-[11px] text-danger">
          Dernière erreur sync :{' '}
          <span className="text-danger">{lastSync.errorMessage.slice(0, 240)}</span>
        </p>
      )}
      {lastSync.summary?.errors && lastSync.summary.errors.length > 0 && (
        <p className="border-t border-warning/20 bg-warning-soft px-5 py-2 text-[11px] text-warning">
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
    tone === 'warn' ? 'text-warning' : 'text-foreground'
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${valueCls}`}>
        {value}
      </dd>
      {hint && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
