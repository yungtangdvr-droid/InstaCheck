import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getAsset,
  getRelanceStatus,
  listAssetEvents,
  listLinkedOpportunities,
} from '@/features/assets/queries'
import { ASSET_TYPE_LABEL } from '@/features/assets/utils'
import { AssetEditor } from '@/components/assets/AssetEditor'
import { OpenEventFeed } from '@/components/assets/OpenEventFeed'
import { RelanceStatus } from '@/components/assets/RelanceStatus'
import { AssetTrafficBlock } from '@/components/attribution/AssetTrafficBlock'
import { DEAL_STAGE_BADGE, DEAL_STAGE_LABEL, formatMoney } from '@/features/deals/utils'

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const asset = await getAsset(supabase, id)
  if (!asset) notFound()

  const [events, relance, linkedOpps] = await Promise.all([
    listAssetEvents(supabase, id),
    getRelanceStatus(supabase, id),
    listLinkedOpportunities(supabase, id),
  ])

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/assets"
          className="text-sm text-neutral-500 transition-colors hover:text-white"
        >
          ← Decks
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{asset.name}</h1>
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            {ASSET_TYPE_LABEL[asset.type]}
          </span>
        </div>
        {asset.papermarkLinkUrl && (
          <p className="mt-1 text-xs text-neutral-500">
            <a
              href={asset.papermarkLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
            >
              {asset.papermarkLinkUrl}
            </a>
          </p>
        )}
      </div>

      <AssetEditor asset={asset} />

      <RelanceStatus status={relance} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Événements</h2>
        <OpenEventFeed events={events} />
      </section>

      <AssetTrafficBlock assetId={id} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Opportunités liées</h2>
        {linkedOpps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-4 text-center text-xs text-neutral-500">
            Aucune opportunité ne référence ce deck. Ouvrez une fiche deal et sélectionnez ce deck pour le lier.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
            {linkedOpps.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/deals/${o.id}`} className="font-medium text-white hover:underline">
                    {o.name}
                  </Link>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${DEAL_STAGE_BADGE[o.stage]}`}>
                    {DEAL_STAGE_LABEL[o.stage]}
                  </span>
                  {o.brandName && o.brandId && (
                    <Link
                      href={`/crm/brands/${o.brandId}`}
                      className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      {o.brandName}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>{formatMoney(o.estimatedValue, o.currency)}</span>
                  <span>{o.probability}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
