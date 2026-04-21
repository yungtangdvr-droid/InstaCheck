import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getBrand,
  getBrandContacts,
  getOpenTasksForBrand,
  getTouchpointsForBrand,
  listUnlinkedContactsForBrand,
} from '@/features/crm/queries'
import { BrandEditor } from '@/components/crm/BrandEditor'
import { ContactLinkPicker } from '@/components/crm/ContactLinkPicker'
import { ContactTimeline } from '@/components/crm/ContactTimeline'
import { NewContactInline } from '@/components/crm/NewContactInline'
import { TaskInline } from '@/components/crm/TaskInline'
import { TouchpointComposer } from '@/components/crm/TouchpointComposer'
import { BrandTrafficBlock } from '@/components/attribution/BrandTrafficBlock'
import { BRAND_STATUS_BADGE, BRAND_STATUS_LABEL } from '@/features/crm/utils'

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const brand = await getBrand(supabase, id)
  if (!brand) notFound()

  const [linkedContacts, availableContacts, touchpoints, tasks] = await Promise.all([
    getBrandContacts(supabase, id),
    listUnlinkedContactsForBrand(supabase, id),
    getTouchpointsForBrand(supabase, id),
    getOpenTasksForBrand(supabase, id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/crm"
            className="text-sm text-neutral-500 transition-colors hover:text-white"
          >
            ← CRM
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{brand.name}</h1>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${BRAND_STATUS_BADGE[brand.status]}`}
            >
              {BRAND_STATUS_LABEL[brand.status]}
            </span>
          </div>
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-neutral-500 hover:text-neutral-300"
            >
              {brand.website}
            </a>
          )}
        </div>
      </div>

      <BrandEditor brand={brand} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">Contacts liés</h2>
          <NewContactInline
            linkToBrandId={brand.id}
            label="+ Nouveau contact lié"
            redirectOnCreate={false}
          />
        </div>
        <ContactLinkPicker
          brandId={brand.id}
          linkedContacts={linkedContacts}
          availableContacts={availableContacts}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Touchpoints</h2>
        <TouchpointComposer brandId={brand.id} />
        <ContactTimeline touchpoints={touchpoints} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Tâches</h2>
        <TaskInline tasks={tasks} linkedBrandId={brand.id} />
      </section>

      <BrandTrafficBlock brandId={brand.id} />
    </div>
  )
}
