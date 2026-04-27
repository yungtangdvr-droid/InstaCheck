'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  formatAnalyzeNewResult,
  type TAnalyzeNewBody,
} from './format-analyze-result'

const NBSP = ' '

// Single state machine — same shape as AnalyzeNewButton — so a stale
// error from a previous click cannot leak into the next request.
type TResult =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'analyzing' }
  | { kind: 'success' | 'warning' | 'error'; message: string }

type TSyncBody = {
  ok?:        boolean
  error?:     string
  message?:   string
  durationMs?:number
  errors?:    string[]
}

export function SyncNowButton() {
  const router = useRouter()
  const [result, setResult] = useState<TResult>({ kind: 'idle' })
  const [isPending, startTransition] = useTransition()

  async function trigger() {
    // Hard reset before the network calls so the previous run's error or
    // warning disappears the moment the operator clicks again.
    setResult({ kind: 'syncing' })

    try {
      const syncRes = await fetch('/api/meta/sync-now', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
      })
      const syncBody = await syncRes.json().catch(() => null) as TSyncBody | null

      if (!syncRes.ok || !syncBody?.ok) {
        const detail =
          syncBody?.message
          ?? syncBody?.error
          ?? `Erreur ${syncRes.status}`
        setResult({ kind: 'error', message: detail.slice(0, 160) })
        return
      }

      // Sync succeeded → chain content analysis on newly synced posts.
      // A failure of this second call must NOT poison the sync result:
      // surface a warning and keep the page refresh.
      setResult({ kind: 'analyzing' })

      let analysis: TAnalyzeNewBody | null = null
      let analysisStatus = 0
      let analysisOk     = false
      let analysisFailed = false
      try {
        const aRes = await fetch('/api/content/analyze-new', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
        })
        analysisStatus = aRes.status
        analysisOk     = aRes.ok
        analysis = await aRes.json().catch(() => null) as TAnalyzeNewBody | null
      } catch {
        analysisFailed = true
      }

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.debug('[SyncNowButton] /api/content/analyze-new', {
          httpStatus: analysisStatus,
          httpOk:     analysisOk,
          ok:         analysis?.ok,
          partial:    analysis?.partial,
          retryable:  analysis?.retryable,
          processed:  analysis?.processed,
          completed:  analysis?.completed,
          failed:     analysis?.failed,
          noOpReason: analysis?.noOpReason,
        })
      }

      if (analysisFailed) {
        setResult({ kind: 'warning', message: 'Sync OK · analyse contenu à relancer' })
      } else {
        const formatted = formatAnalyzeNewResult(
          { status: analysisStatus, ok: analysisOk },
          analysis,
        )
        setResult(mapAnalysisToSync(formatted, analysis))
      }

      startTransition(() => router.refresh())
    } catch (err) {
      setResult({
        kind:    'error',
        message: err instanceof Error ? err.message.slice(0, 160) : 'Erreur réseau',
      })
    }
  }

  const isLoading = result.kind === 'syncing' || result.kind === 'analyzing' || isPending
  const label =
    result.kind === 'syncing'   ? 'Synchronisation en cours…' :
    result.kind === 'analyzing' ? 'Analyse des nouveaux posts…' :
    isPending                   ? 'Mise à jour…' :
    result.kind === 'success' || result.kind === 'warning' ? 'Resynchroniser' :
                                  'Synchroniser maintenant'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={isLoading}
        aria-busy={isLoading}
        title="Sync puis analyse des nouveaux posts. Peut prendre quelques minutes."
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && (
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400"
            aria-hidden
          />
        )}
        {label}
      </button>
      {result.kind === 'idle' && (
        <span className="text-[10px] text-neutral-600">
          Sync puis analyse · ne ferme pas l&apos;onglet
        </span>
      )}
      {result.kind === 'syncing' && (
        <span className="text-[10px] text-neutral-500">
          Peut prendre 1 à 3{NBSP}min · garde l&apos;onglet ouvert
        </span>
      )}
      {result.kind === 'analyzing' && (
        <span className="text-[10px] text-neutral-400">Analyse des nouveaux posts…</span>
      )}
      {result.kind === 'success' && (
        <span className="text-[10px] text-emerald-400">{result.message}</span>
      )}
      {result.kind === 'warning' && (
        <span className="max-w-[14rem] text-right text-[10px] text-amber-400">
          {result.message}
        </span>
      )}
      {result.kind === 'error' && (
        <span className="max-w-[14rem] text-right text-[10px] text-red-400">
          {result.message.slice(0, 160)}
        </span>
      )}
    </div>
  )
}

// Map the shared analyze-new outcome to the sync button's vocabulary
// (success / warning) and prepend a "Sync OK ·" prefix when the analysis
// step degraded — the sync itself succeeded by the time we get here.
function mapAnalysisToSync(
  formatted: ReturnType<typeof formatAnalyzeNewResult>,
  body:      TAnalyzeNewBody | null,
): { kind: 'success' | 'warning' | 'error'; message: string } {
  const completed = body?.completed ?? 0
  const failed    = body?.failed    ?? 0
  const plural    = (n: number) => (n > 1 ? 's' : '')

  switch (formatted.kind) {
    case 'success':
      return {
        kind:    'success',
        message: `Sync terminée · ${completed} post${plural(completed)} analysé${plural(completed)}`,
      }
    case 'empty':
      // Either disabled or no candidates — both are clean states for the
      // sync flow.
      return {
        kind:    'success',
        message: body?.disabled || body?.noOpReason === 'content_analysis_disabled'
          ? 'Sync terminée'
          : 'Sync terminée · aucun nouveau post à analyser',
      }
    case 'retry':
      return {
        kind:    'warning',
        message: 'Sync OK · Gemini indisponible, relance dans quelques minutes',
      }
    case 'partial':
      return {
        kind:    'warning',
        message: `Sync OK · analyse partielle · ${completed} analysé${plural(completed)}, ${failed} erreur${plural(failed)}`,
      }
    case 'error':
      // Per-post total failure that's not retryable, OR a route-level
      // failure on /api/content/analyze-new. Either way the sync itself
      // succeeded, so warn rather than red-flag.
      return {
        kind:    'warning',
        message: failed > 0
          ? `Sync OK · analyse échouée · ${failed} erreur${plural(failed)}`
          : `Sync OK · analyse à relancer · ${formatted.message}`,
      }
  }
}
