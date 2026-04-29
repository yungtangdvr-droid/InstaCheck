import type { ContentRecommendation, ContentRecommendationType } from '@creator-hub/types'
import { VerdictBadge, type VerdictBadgeProps } from '@/components/ui/verdict-badge'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

const TYPE_CONFIG: Record<
  ContentRecommendationType,
  { label: string; tone: NonNullable<VerdictBadgeProps['tone']> }
> = {
  replicate: { label: 'Répliquer',  tone: 'success' },
  adapt:     { label: 'Adapter',    tone: 'warning' },
  drop:      { label: 'Abandonner', tone: 'danger'  },
}

export function HypothesisEditor({
  recommendation,
}: {
  recommendation: ContentRecommendation
}) {
  const config = TYPE_CONFIG[recommendation.type] ?? {
    label: recommendation.type,
    tone:  'neutral' as const,
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-5">
        <div className="flex items-center gap-3">
          <VerdictBadge tone={config.tone} size="md">
            {config.label}
          </VerdictBadge>
          <span className="text-xs text-muted-foreground">
            {new Date(recommendation.createdAt).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {recommendation.post && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground">Légende IG du post lié</p>
            <p className="line-clamp-2 text-sm text-card-foreground">
              {recommendation.post.caption ?? (
                <span className="italic text-muted-foreground">Sans légende IG</span>
              )}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                {recommendation.post.mediaType}
              </span>
              {recommendation.post.permalink && (
                <a
                  href={recommendation.post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Voir sur Instagram →
                </a>
              )}
            </div>
          </div>
        )}

        {!recommendation.post && recommendation.postId && (
          <p className="text-xs text-muted-foreground">Post lié introuvable (id: {recommendation.postId})</p>
        )}

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Raison</p>
          <p className="text-sm text-card-foreground">
            {recommendation.reason ?? (
              <span className="italic text-muted-foreground">Aucune raison renseignée</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
