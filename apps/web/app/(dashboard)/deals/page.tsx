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
          <h1 className="text-2xl font-semibold text-white">Deal Pipeline</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {deals.length} opportunité{deals.length > 1 ? 's' : ''}
            {brandId ? ' (filtrées par brand)' : ''}
          </p>
        </div>
        <NewDealInline brandOptions={brandOptions} />
      </div>

      <form method="get" action="/deals" className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Brand</span>
          <select
            name="brandId"
            defaultValue={brandId ?? ''}
            className="min-w-48 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-neutral-600"
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
          className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-700"
        >
          Filtrer
        </button>
        {brandId && (
          <a
            href="/deals"
            className="rounded px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:text-white"
          >
            Réinitialiser
          </a>
        )}
      </form>

      <KanbanBoard groups={groups} />
    </div>
  )
}
