import Link from 'next/link'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { KpiTile } from '@/components/ui/kpi-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { ArchiveReviewRow } from '@/features/content-lab/ArchiveReviewRow'
import {
  getArchiveReviewQueue,
  ARCHIVE_REVIEW_CANDIDATE_CAP,
} from '@/lib/meta/queries/archive-review-queue'

export const dynamic = 'force-dynamic'

const NF = new Intl.NumberFormat('fr-FR')
const PCT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export default async function ArchiveReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: rawPage } = await searchParams
  const page = parsePage(rawPage)

  const supabase = await createServerSupabaseClient()
  const queue    = await getArchiveReviewQueue(supabase, { page })

  const totalPages = Math.max(1, Math.ceil(queue.total / queue.pageSize))
  const safePage   = Math.min(page, totalPages)
  const hasPrev    = safePage > 1
  const hasNext    = safePage < totalPages

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Archive Pattern Library"
        title="File de revue archive"
        description="Liste lecture seule des posts à revoir en priorité. Aucune action destructive ni IA. La file se met à jour naturellement à mesure que le backfill métadonnées progresse — l'ordre peut donc évoluer entre deux visites."
        actions={
          <Link
            href="/content-lab/archive"
            className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
          >
            ← État d'indexation
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionHeader
          title="Couverture de la file"
          description={`Calculé sur le pool gating actuel (cap ${NF.format(ARCHIVE_REVIEW_CANDIDATE_CAP)} candidats).`}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="Éligibles"
            value={NF.format(queue.kpis.eligibleTotal)}
            hint="metadata = imported · revue humaine = pending"
          />
          <KpiTile
            label="Dans la file"
            value={NF.format(queue.kpis.inQueue)}
            hint={
              queue.truncated
                ? 'Tronqué au cap 500 — élargir le cap si besoin'
                : 'Pool complet scoré'
            }
          />
          <KpiTile
            label="Avec légende IG"
            value={PCT.format(queue.kpis.captionPresentShare)}
            hint="Part du pool avec une légende non vide"
          />
          <KpiTile
            label="Avec métriques"
            value={PCT.format(queue.kpis.withMetricsShare)}
            hint="Part du pool ayant au moins une ligne post_metrics_daily"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Posts à revoir"
          description="Tri : score décroissant, puis posté le plus récent. Les chips « Pourquoi prioritisé » détaillent les bonus appliqués."
        />

        {queue.items.length === 0 ? (
          <EmptyState
            title="Aucun post à revoir pour l'instant."
            description={
              queue.kpis.eligibleTotal === 0
                ? "Le backfill métadonnées n'a encore rien indexé en attente de revue. Cette page se remplira au fil des runs."
                : 'Aucun post sur cette page. Reviens à la première page.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {queue.items.map((item) => (
              <ArchiveReviewRow key={item.postId} item={item} />
            ))}
          </div>
        )}

        {queue.total > 0 ? (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 pt-2 text-sm"
          >
            <span className="text-xs text-muted-foreground">
              Page {NF.format(safePage)} / {NF.format(totalPages)} ·{' '}
              {NF.format(queue.total)} posts dans la file
            </span>
            <div className="flex items-center gap-2">
              <PagerLink
                href={`/content-lab/archive/review?page=${safePage - 1}`}
                disabled={!hasPrev}
              >
                ← Précédent
              </PagerLink>
              <PagerLink
                href={`/content-lab/archive/review?page=${safePage + 1}`}
                disabled={!hasNext}
              >
                Suivant →
              </PagerLink>
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-muted"
    >
      {children}
    </Link>
  )
}

export const metadata = {
  title: 'File de revue archive — Creator Hub',
}
