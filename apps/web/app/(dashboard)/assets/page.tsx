import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listAssets } from '@/features/assets/queries'
import { AssetRow } from '@/components/assets/AssetRow'
import { NewAssetInline } from '@/components/assets/NewAssetInline'

export default async function AssetsPage() {
  const supabase = await createServerSupabaseClient()
  const assets = await listAssets(supabase)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deck Tracking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {assets.length} asset{assets.length > 1 ? 's' : ''} · ouvertures Papermark suivies en temps réel.
          </p>
        </div>
        <NewAssetInline />
      </div>

      {assets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucun asset. Créez un deck et collez son Papermark link ID pour commencer à tracker les ouvertures.
        </p>
      ) : (
        <ul className="space-y-2">
          {assets.map((asset) => (
            <li key={asset.id}>
              <AssetRow asset={asset} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
