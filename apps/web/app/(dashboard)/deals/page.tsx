import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  groupByStage,
  listBrandOptions,
  listOpportunities,
} from '@/features/deals/queries'
import { KanbanBoard } from '@/components/deals/KanbanBoard'
import { NewDealInline } from '@/components/deals/NewDealInline'

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>
}) {
  const { brandId } = await searchParams
  const supabase = await createServerSupabaseClient()

  const [deals, brandOptions] = await Promise.all([
    listOpportunities(supabase, brandId ? { brandId } : undefined),
    listBrandOptions(supabase),
  ])

  const groups = groupByStage(deals)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deal Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {deals.length} opportunité{deals.length > 1 ? 's' : ''}
            {brandId ? ' (filtrées par brand)' : ''}
          </p>
        </div>
        <NewDealInline brandOptions={brandOptions} />
      </div>

      <form method="get" action="/deals" className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Brand</span>
          <select
            name="brandId"
            defaultValue={brandId ?? ''}
            className="min-w-48 rounded bg-input px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">Toutes les brands</option>
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          Filtrer
        </button>
        {brandId && (
          <a
            href="/deals"
            className="rounded px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Réinitialiser
          </a>
        )}
      </form>

      <KanbanBoard groups={groups} />
    </div>
  )
}
