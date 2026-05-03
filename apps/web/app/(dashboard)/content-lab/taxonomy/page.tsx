import Link from 'next/link'

import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import {
  getAxes,
  listCoreAxes,
  listAdvancedAxes,
  totalItemCount,
} from '@/lib/taxonomy'
import type { TaxonomyAxisDef } from '@creator-hub/types'

// Read-only reference page for the Yugnat creative taxonomy V1.
// Foundation only : pas d’annotation, pas d’écriture, pas d’IA.
//
// Vue par défaut : axes core uniquement. `?view=all` montre les
// 12 axes (core + advanced). Aucun JS client : tout est rendu
// côté serveur, le toggle passe par un Link.

const NF = new Intl.NumberFormat('fr-FR')

type TaxonomyView = 'core' | 'all'

function parseView(raw: string | string[] | undefined): TaxonomyView {
  if (typeof raw === 'string' && raw === 'all') return 'all'
  return 'core'
}

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { view: rawView } = await searchParams
  const view = parseView(rawView)

  const allAxes = getAxes()
  const visibleAxes: ReadonlyArray<TaxonomyAxisDef> =
    view === 'all' ? allAxes : listCoreAxes()

  const coreCount     = listCoreAxes().reduce((acc, a) => acc + a.items.length, 0)
  const advancedCount = listAdvancedAxes().reduce((acc, a) => acc + a.items.length, 0)
  const total         = totalItemCount()

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Archive Pattern Library"
        title="Taxonomie créative"
        description="Référentiel de lecture des memes Yugnat : 12 axes, IDs stables. Vue lecture seule. Aucun appel d'IA, d'embeddings ou d'analyse d'image n'est déclenché par cette page."
        actions={
          <>
            <Link
              href="/content-lab/taxonomy?view=core"
              aria-current={view === 'core' ? 'page' : undefined}
              className={
                'inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition-colors ' +
                (view === 'core'
                  ? 'border-foreground/40 bg-foreground/5 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent')
              }
            >
              Core
            </Link>
            <Link
              href="/content-lab/taxonomy?view=all"
              aria-current={view === 'all' ? 'page' : undefined}
              className={
                'inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition-colors ' +
                (view === 'all'
                  ? 'border-foreground/40 bg-foreground/5 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent')
              }
            >
              Tous les axes
            </Link>
          </>
        }
      />

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {NF.format(allAxes.length)} axes · {NF.format(total)} items
          {' · '}
          <span>core : {NF.format(coreCount)}</span>
          {' · '}
          <span>advanced : {NF.format(advancedCount)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Cette taxonomie sert de contrat stable : chaque item possède un
          identifiant kebab-case qui ne changera pas. Elle sera utilisée plus
          tard pour annoter les posts archive et générer des candidats de remix.
        </p>
      </section>

      <div className="space-y-12">
        {visibleAxes.map((axis) => (
          <section key={axis.id} className="space-y-4">
            <SectionHeader
              eyebrow={axis.priority === 'core' ? 'Core' : 'Advanced'}
              title={axis.label}
              description={axis.description}
              actions={
                <span className="text-xs text-muted-foreground">
                  {NF.format(axis.items.length)} items
                </span>
              }
            />
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {axis.items.map((item) => (
                <li
                  key={`${axis.id}:${item.id}`}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {item.id}
                    </code>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                  {item.examples && item.examples.length > 0 ? (
                    <p className="mt-1.5 text-[11px] italic text-muted-foreground/80">
                      Ex. {item.examples.join(' · ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
