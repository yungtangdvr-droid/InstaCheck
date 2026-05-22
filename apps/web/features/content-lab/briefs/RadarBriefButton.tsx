'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { generateBriefForRadarItem } from './actions'

interface Props {
  radarItemId: string
  briefId:     string | null
}

// Map machine-readable error codes returned by `generateBriefForRadarItem`
// to short French messages. Falls back to the raw code when unknown so
// debugging stays possible. Never display `explicit_item_skipped_or_unknown`
// — that code no longer exists; older codes are kept here defensively.
function formatGenerateError(raw: string): string {
  const head = raw.split(':')[0] ?? raw
  switch (head) {
    case 'unauthorized':                    return 'Session expirée · reconnecte-toi'
    case 'missing_radar_item_id':           return 'Item radar manquant'
    case 'missing_radar_item':              return 'Item radar introuvable'
    case 'missing_required_signal_text':    return 'Signal incomplet · titre + résumé/url manquants'
    case 'unsafe_signal':                   return 'Signal non éligible · sujet sensible (drame, controverse, désinformation)'
    case 'already_has_recent_brief':        return 'Un brief récent existe déjà pour ce signal'
    case 'no_eligible_candidates':          return 'Aucun candidat éligible'
    case 'missing_env':                     return 'Configuration serveur incomplète'
    case 'provider_error':                  return 'Échec génération · Gemini et OpenAI ont échoué'
    case 'generation_failed':               return 'Échec génération'
    // legacy code, should no longer appear after v1.1 hotfix.
    case 'explicit_item_skipped_or_unknown':return 'Génération impossible · raison inconnue'
    default:                                return raw.slice(0, 160)
  }
}

export function RadarBriefButton({ radarItemId, briefId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (briefId) {
    return (
      <Link
        href={`/content-lab/briefs/${briefId}`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        <Sparkles />
        View brief
      </Link>
    )
  }

  function handle() {
    setError(null)
    startTransition(async () => {
      const result = await generateBriefForRadarItem(radarItemId)
      if (result.error) {
        setError(formatGenerateError(result.error))
        return
      }
      if (result.data?.briefId) {
        router.push(`/content-lab/briefs/${result.data.briefId}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handle}
      >
        <Sparkles />
        {isPending ? 'Génération…' : 'Generate brief'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
