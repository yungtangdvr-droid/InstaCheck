import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getContact,
  getOpenTasksForContact,
  getParentBrand,
  getTouchpointsForContact,
} from '@/features/crm/queries'
import { ContactEditor } from '@/components/crm/ContactEditor'
import { ContactTimeline } from '@/components/crm/ContactTimeline'
import { TaskInline } from '@/components/crm/TaskInline'
import { TouchpointComposer } from '@/components/crm/TouchpointComposer'
import { formatDate } from '@/features/crm/utils'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const contact = await getContact(supabase, id)
  if (!contact) notFound()

  const [parentBrand, touchpoints, tasks] = await Promise.all([
    getParentBrand(supabase, contact),
    getTouchpointsForContact(supabase, id),
    getOpenTasksForContact(supabase, id),
  ])

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/crm/contacts"
          className="text-sm text-neutral-500 transition-colors hover:text-white"
        >
          ← Contacts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{contact.fullName}</h1>
          {parentBrand && (
            <Link
              href={`/crm/brands/${parentBrand.id}`}
              className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
            >
              {parentBrand.name}
            </Link>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Dernier contact : {formatDate(contact.lastContactAt)}
          {' · '}
          Prochaine relance : {formatDate(contact.nextFollowUpAt)}
        </p>
      </div>

      <ContactEditor contact={contact} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Touchpoints</h2>
        <TouchpointComposer contactId={contact.id} />
        <ContactTimeline touchpoints={touchpoints} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Tâches</h2>
        <TaskInline tasks={tasks} linkedContactId={contact.id} />
      </section>
    </div>
  )
}
