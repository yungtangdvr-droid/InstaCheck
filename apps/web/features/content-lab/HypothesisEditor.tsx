// Sprint 3: read-only scaffold.
// Full editing (change type, update reason, link/unlink post) is deferred to Sprint 4.
import type { ContentRecommendation, ContentRecommendationType } from '@creator-hub/types'

const TYPE_CONFIG: Record<
  ContentRecommendationType,
  { label: string; badgeClass: string }
> = {
  replicate: { label: 'Répliquer',   badgeClass: 'bg-emerald-500/20 text-emerald-400' },
  adapt:     { label: 'Adapter',     badgeClass: 'bg-yellow-500/20 text-yellow-400' },
  drop:      { label: 'Abandonner',  badgeClass: 'bg-red-500/20 text-red-400' },
}

export function HypothesisEditor({
  recommendation,
}: {
  recommendation: ContentRecommendation
}) {
  const config = TYPE_CONFIG[recommendation.type] ?? {
    label: recommendation.type,
    badgeClass: 'bg-neutral-800 text-neutral-400',
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}>
          {config.label}
        </span>
        <span className="text-xs text-neutral-500">
          {new Date(recommendation.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>

      {recommendation.post && (
        <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <p className="mb-1 text-xs text-neutral-500">Post lié</p>
          <p className="line-clamp-2 text-sm text-neutral-300">
            {recommendation.post.caption ?? (
              <span className="italic text-neutral-600">Pas de caption</span>
            )}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
              {recommendation.post.mediaType}
            </span>
            {recommendation.post.permalink && (
              <a
                href={recommendation.post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Voir sur Instagram →
              </a>
            )}
          </div>
        </div>
      )}

      {!recommendation.post && recommendation.postId && (
        <p className="text-xs text-neutral-600">Post lié introuvable (id: {recommendation.postId})</p>
      )}

      <div>
        <p className="mb-1 text-xs text-neutral-500">Raison</p>
        <p className="text-sm text-neutral-300">
          {recommendation.reason ?? (
            <span className="italic text-neutral-600">Aucune raison renseignée</span>
          )}
        </p>
      </div>

      <p className="border-t border-neutral-800 pt-3 text-xs text-neutral-600">
        Édition complète disponible en Sprint 4.
      </p>
    </div>
  )
}
