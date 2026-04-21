import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listBrands } from '@/features/crm/queries'
import { isBrandStatus } from '@/features/crm/utils'
import { BrandCard } from '@/components/crm/BrandCard'
import { BrandStatusTabs } from '@/components/crm/BrandStatusTabs'
import { NewBrandInline } from '@/components/crm/NewBrandInline'

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: raw } = await searchParams
  const status = isBrandStatus(raw) ? raw : undefined
  const current = status ?? 'all'

  const supabase = await createServerSupabaseClient()
  const brands = await listBrands(supabase, status)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Brand CRM</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Brands, contacts, touchpoints et tâches de relance
          </p>
        </div>
        <Link
          href="/crm/contacts"
          className="text-sm text-neutral-400 transition-colors hover:text-white"
        >
          Contacts →
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BrandStatusTabs current={current} />
        <NewBrandInline />
      </div>

      {brands.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-800 text-sm text-neutral-500">
          {status
            ? `Aucune brand avec le statut « ${status} ».`
            : 'Aucune brand enregistrée. Ajoute-en une pour commencer.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </div>
  )
}
