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
        setError(result.error)
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
