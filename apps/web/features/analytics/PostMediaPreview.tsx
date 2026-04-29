'use client'

import { useState } from 'react'
import { FORMAT_LABEL } from './utils'

// Hero preview rendered below the header on /analytics/post/[id]. Reuses the
// `previewUrl` extracted by `extractPreviewUrls` from raw_instagram_media. The
// URL is a Meta CDN signed link that rotates ~24h, so a 403/onError must
// degrade to the placeholder rather than show a broken image. We deliberately
// avoid next/image here — its caching layer would freeze a stale URL.
export function PostMediaPreview({
  previewUrl,
  mediaType,
  permalink,
  caption,
}: {
  previewUrl: string | null
  mediaType:  string
  permalink:  string | null
  caption:    string | null
}) {
  const [broken, setBroken] = useState(false)
  const showPlaceholder = !previewUrl || broken

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-full max-w-xs">
          {showPlaceholder ? (
            <div
              className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
              title={
                previewUrl
                  ? "Aperçu indisponible — l'URL Meta a probablement expiré."
                  : 'Aucun aperçu disponible.'
              }
            >
              {FORMAT_LABEL[mediaType] ?? mediaType}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={caption ?? ''}
              loading="lazy"
              className="aspect-square w-full rounded-md bg-muted object-cover"
              onError={() => setBroken(true)}
            />
          )}
        </div>
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Aperçu du post
          </p>
          <p className="mt-1 text-card-foreground">
            {mediaType === 'VIDEO' || mediaType === 'REEL'
              ? "Image de couverture (thumbnail). Le lecteur vidéo n'est pas embarqué — ouvre Instagram pour le contenu vidéo."
              : 'Image telle que renvoyée par l\'API Meta au moment du sync.'}
          </p>
          {showPlaceholder && previewUrl && (
            <p className="mt-2 text-xs text-warning">
              Lien Meta CDN expiré ou inaccessible. Re-sync l&apos;ingestion pour rafraîchir.
            </p>
          )}
          {permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Voir sur Instagram →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
