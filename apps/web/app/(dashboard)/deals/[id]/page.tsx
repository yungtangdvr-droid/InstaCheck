import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getAssetName,
  getBrandName,
  getContactName,
  getOpportunity,
  getOpportunityStageHistory,
  getOpportunityTasks,
  listBrandOptions,
} from '@/features/deals/queries'
import { listAssetOptions } from '@/features/assets/queries'
import { DealEditor } from '@/components/deals/DealEditor'
import { DealTaskInline } from '@/components/deals/DealTaskInline'
import { DealTimeline } from '@/components/deals/DealTimeline'
import { StageDropdown } from '@/components/deals/StageDropdown'
import { DealDeckPicker } from '@/components/assets/DealDeckPicker'
import { OpportunityTrafficBlock } from '@/components/attribution/OpportunityTrafficBlock'
import {
  DEAL_STAGE_BADGE,
  DEAL_STAGE_LABEL,
  formatDate,
  formatMoney,
} from '@/features/deals/utils'

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const opportunity = await getOpportunity(supabase, id)
  if (!opportunity) notFound()

  const [history, tasks, brandOptions, brandName, contactName, deckName, assetOptions] = await Promise.all([
    getOpportunityStageHistory(supabase, id),
    getOpportunityTasks(supabase, id),
    listBrandOptions(supabase),
    opportunity.brandId   ? getBrandName(supabase, opportunity.brandId)     : Promise.resolve(null),
    opportunity.contactId ? getContactName(supabase, opportunity.contactId) : Promise.resolve(null),
    opportunity.deckId    ? getAssetName(supabase, opportunity.deckId)      : Promise.resolve(null),
    listAssetOptions(supabase),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/deals"
            className="text-sm text-neutral-500 transition-colors hover:text-white"
          >
            ← Deals
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{opportunity.name}</h1>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${DEAL_STAGE_BADGE[opportunity.stage]}`}
            >
              {DEAL_STAGE_LABEL[opportunity.stage]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            {brandName && opportunity.brandId && (
              <Link
                href={`/crm/brands/${opportunity.brandId}`}
                className="hover:text-neutral-300"
              >
                {brandName}
              </Link>
            )}
            {contactName && opportunity.contactId && (
              <Link
                href={`/crm/contacts/${opportunity.contactId}`}
                className="hover:text-neutral-300"
              >
                {contactName}
              </Link>
            )}
            <span>{formatMoney(opportunity.estimatedValue, opportunity.currency)}</span>
            <span>{opportunity.probability}%</span>
            {opportunity.expectedCloseAt && (
              <span>cible {formatDate(opportunity.expectedCloseAt)}</span>
            )}
          </div>
        </div>
        <StageDropdown
          opportunityId={opportunity.id}
          stage={opportunity.stage}
          size="md"
        />
      </div>

      <DealEditor opportunity={opportunity} brandOptions={brandOptions} />

      <DealDeckPicker
        opportunityId={opportunity.id}
        currentDeckId={opportunity.deckId}
        assetOptions={assetOptions}
      />
      {opportunity.deckId && deckName && (
        <p className="-mt-4 text-xs text-neutral-500">
          Actuellement : <span className="text-neutral-300">{deckName}</span>
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Historique des stages</h2>
        <DealTimeline events={history} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Tâches</h2>
        <DealTaskInline
          tasks={tasks}
          linkedOpportunityId={opportunity.id}
          linkedBrandId={opportunity.brandId}
          linkedContactId={opportunity.contactId}
        />
      </section>

      <OpportunityTrafficBlock opportunityId={opportunity.id} />
    </div>
  )
}
